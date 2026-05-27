use std::collections::HashMap;
use crate::models::*;

/// Execute a pre-request script that can modify the request.
/// Returns the (possibly modified) request along with script logs/test results.
pub fn execute_pre_request(
    script: &str,
    request: &HttpRequest,
    env_vars: &HashMap<String, String>,
) -> Result<(HttpRequest, ScriptResults), String> {
    let mut results = ScriptResults {
        logs: vec![],
        tests: vec![],
        errors: vec![],
        modified_variables: vec![],
    };

    if script.trim().is_empty() {
        return Ok((request.clone(), results));
    }

    // Serialize request to JSON for JS
    let req_json = serde_json::to_value(request).map_err(|e| format!("Failed to serialize request: {}", e))?;
    let env_json = serde_json::to_value(env_vars).map_err(|e| format!("Failed to serialize env vars: {}", e))?;

    // Build the JS wrapper that provides the sandbox API
    let wrapped = format!(
        r#"
(function() {{
    const __logs = [];
    const __tests = [];
    const __errors = [];
    const __vars = {{}};

    const console = {{
        log: (...args) => __logs.push({{ level: "log", message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }}),
        warn: (...args) => __logs.push({{ level: "warn", message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }}),
        error: (...args) => __logs.push({{ level: "error", message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }}),
    }};

    const pm = {{
        test: (name, fn) => {{
            try {{
                fn();
                __tests.push({{ name, passed: true }});
            }} catch (e) {{
                __tests.push({{ name, passed: false }});
                __errors.push(`Test "{{name}}" failed: ${{e.message || e}}`);
            }}
        }},
        expect: (actual) => ({{
            to: {{
                equal: (expected) => {{
                    if (JSON.stringify(actual) !== JSON.stringify(expected)) {{
                        throw new Error(`Expected ${{JSON.stringify(expected)}}, got ${{JSON.stringify(actual)}}`);
                    }}
                }},
                not: {{
                    equal: (expected) => {{
                        if (JSON.stringify(actual) === JSON.stringify(expected)) {{
                            throw new Error(`Expected ${{JSON.stringify(actual)}} not to equal ${{JSON.stringify(expected)}}`);
                        }}
                    }}
                }},
                include: (expected) => {{
                    if (!String(actual).includes(String(expected))) {{
                        throw new Error(`Expected "${{actual}}" to include "${{expected}}"`);
                    }}
                }},
                toBe: (expected) => {{
                    if (actual !== expected) {{
                        throw new Error(`Expected ${{expected}}, got ${{actual}}`);
                    }}
                }},
                toHaveLength: (len) => {{
                    if (!actual || actual.length !== len) {{
                        throw new Error(`Expected length ${{len}}, got ${{actual?.length || 0}}`);
                    }}
                }},
                be: {{
                    below: (limit) => {{
                        if (actual >= limit) {{
                            throw new Error(`Expected ${{actual}} to be below ${{limit}}`);
                        }}
                    }},
                    above: (limit) => {{
                        if (actual <= limit) {{
                            throw new Error(`Expected ${{actual}} to be above ${{limit}}`);
                        }}
                    }},
                }},
            }},
        }}),
        variables: {{
            get: (key) => __vars[key],
            set: (key, value) => {{ __vars[key] = value; }},
            unset: (key) => {{ delete __vars[key]; }},
        }},
        environment: {{
            get: (key) => __vars[key] || env[key],
            set: (key, value) => {{ __vars[key] = value; }},
        }},
    }};

    const request = {req_json};

    const env = {env_json};

    try {{
        {script}
    }} catch (e) {{
        __errors.push(`Script error: ${{e.message || e}}${{e.stack ? '\\n' + e.stack : ''}}`);
    }}

    return JSON.stringify({{
        request: request,
        logs: __logs,
        tests: __tests,
        errors: __errors,
        variables: __vars,
    }});
}})()
"#
    );

    // Use rquickjs to execute the script
    let result = execute_js(&wrapped, 5000)?; // 5 second timeout
    let parsed: serde_json::Value =
        serde_json::from_str(&result).map_err(|e| format!("Failed to parse script output: {}", e))?;

    let modified_request: HttpRequest = serde_json::from_value(parsed["request"].clone())
        .map_err(|e| format!("Failed to deserialize modified request: {}", e))?;

    results.logs = serde_json::from_value(parsed["logs"].clone()).unwrap_or_default();
    results.tests = serde_json::from_value(parsed["tests"].clone()).unwrap_or_default();
    results.errors = serde_json::from_value(parsed["errors"].clone()).unwrap_or_default();

    if let Some(vars) = parsed["variables"].as_object() {
        results.modified_variables = vars
            .iter()
            .map(|(k, v)| KeyValue {
                key: k.clone(),
                value: v.as_str().unwrap_or("").to_string(),
                enabled: true,
                is_secret: false,
            })
            .collect();
    }

    Ok((modified_request, results))
}

/// Execute variable extractions against a JSON response body using a JS-based JSONPath evaluator.
pub fn execute_extractions(
    extractions: &[VariableExtraction],
    response_body: &str,
) -> Result<Vec<(String, String)>, String> {
    if extractions.is_empty() {
        return Ok(vec![]);
    }

    // Serialize extractions and body to pass into JS
    let ext_json = serde_json::to_string(extractions)
        .map_err(|e| format!("Failed to serialize extractions: {}", e))?;

    let wrapped = format!(
        r#"
(function() {{
    const responseBodyRaw = {};
    const extractions = {};

    let responseBody;
    try {{
        responseBody = JSON.parse(responseBodyRaw);
    }} catch (e) {{
        // Not valid JSON — no extractions possible
        return JSON.stringify({{ results: [] }});
    }}

    // Simple JSONPath evaluator
    function evaluateJsonPath(obj, path) {{
        if (!path.startsWith('$')) return undefined;
        if (path === '$') return obj;

        // Handle bracket notation: $.foo[0].bar, $['foo']['bar']
        // Normalize to dot-separated parts
        let normalized = path.slice(1); // remove $
        // Convert ['foo'] to .foo
        normalized = normalized.replace(/\['([^']+)'\]/g, '.$1');
        // Convert ["foo"] to .foo
        normalized = normalized.replace(/\["([^"]+)"\]/g, '.$1');
        // Convert [0] to .0 for array indexing
        normalized = normalized.replace(/\[(\d+)\]/g, '.$1');

        let parts = normalized.split('.').filter(p => p.length > 0);
        let current = obj;

        for (const part of parts) {{
            if (current === null || current === undefined) return undefined;

            // Handle array index (numeric string key)
            if (/^\d+$/.test(part) && Array.isArray(current)) {{
                const idx = parseInt(part, 10);
                if (idx < current.length) {{
                    current = current[idx];
                }} else {{
                    return undefined;
                }}
                continue;
            }}

            // Handle recursive descent: ..propertyName
            if (part.startsWith('..')) {{
                const searchKey = part.slice(2);
                if (searchKey) {{
                    const result = recursiveFind(current, searchKey);
                    if (result !== undefined) {{
                        current = result;
                        continue;
                    }}
                    return undefined;
                }}
                return current;
            }}

            // Regular property access
            if (current && typeof current === 'object' && part in current) {{
                current = current[part];
            }} else {{
                return undefined;
            }}
        }}

        return current;
    }}

    function recursiveFind(obj, key) {{
        if (obj === null || obj === undefined) return undefined;
        if (typeof obj !== 'object') return undefined;
        if (key in obj) return obj[key];
        for (const v of Object.values(obj)) {{
            if (v && typeof v === 'object') {{
                const result = recursiveFind(v, key);
                if (result !== undefined) return result;
            }}
        }}
        return undefined;
    }}

    const results = [];

    for (const ext of extractions) {{
        if (!ext.enabled) continue;
        try {{
            const value = evaluateJsonPath(responseBody, ext.expression);
            if (value !== undefined && value !== null) {{
                const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
                results.push([ext.target_variable, strVal]);
            }}
        }} catch (e) {{
            // Skip extraction on error
        }}
    }}

    return JSON.stringify({{ results }});
}})()
"#,
        serde_json::to_string(response_body).unwrap_or_else(|_| "\"\"".to_string()),
        ext_json
    );

    let result = execute_js(&wrapped, 3000)?;
    let parsed: serde_json::Value =
        serde_json::from_str(&result).map_err(|e| format!("Failed to parse extraction output: {}", e))?;

    let results: Vec<(String, String)> =
        serde_json::from_value(parsed["results"].clone()).unwrap_or_default();

    Ok(results)
}

/// Execute a post-response script that can inspect the response and run tests.
pub fn execute_post_response(
    script: &str,
    request: &HttpRequest,
    response: &HttpResponse,
    env_vars: &HashMap<String, String>,
) -> Result<ScriptResults, String> {
    let mut results = ScriptResults {
        logs: vec![],
        tests: vec![],
        errors: vec![],
        modified_variables: vec![],
    };

    if script.trim().is_empty() {
        return Ok(results);
    }

    let req_json = serde_json::to_value(request).map_err(|e| format!("Failed to serialize request: {}", e))?;
    let resp_json = serde_json::to_value(response).map_err(|e| format!("Failed to serialize response: {}", e))?;
    let env_json = serde_json::to_value(env_vars).map_err(|e| format!("Failed to serialize env vars: {}", e))?;

    let wrapped = format!(
        r#"
(function() {{
    const __logs = [];
    const __tests = [];
    const __errors = [];
    const __vars = {{}};

    const console = {{
        log: (...args) => __logs.push({{ level: "log", message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }}),
        warn: (...args) => __logs.push({{ level: "warn", message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }}),
        error: (...args) => __logs.push({{ level: "error", message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }}),
    }};

    const pm = {{
        test: (name, fn) => {{
            try {{
                fn();
                __tests.push({{ name, passed: true }});
            }} catch (e) {{
                __tests.push({{ name, passed: false }});
                __errors.push(`Test "{{name}}" failed: ${{e.message || e}}`);
            }}
        }},
        expect: (actual) => ({{
            to: {{
                equal: (expected) => {{
                    if (JSON.stringify(actual) !== JSON.stringify(expected)) {{
                        throw new Error(`Expected ${{JSON.stringify(expected)}}, got ${{JSON.stringify(actual)}}`);
                    }}
                }},
                not: {{
                    equal: (expected) => {{
                        if (JSON.stringify(actual) === JSON.stringify(expected)) {{
                            throw new Error(`Expected ${{JSON.stringify(actual)}} not to equal ${{JSON.stringify(expected)}}`);
                        }}
                    }}
                }},
                include: (expected) => {{
                    if (!String(actual).includes(String(expected))) {{
                        throw new Error(`Expected "${{actual}}" to include "${{expected}}"`);
                    }}
                }},
                toBe: (expected) => {{
                    if (actual !== expected) {{
                        throw new Error(`Expected ${{expected}}, got ${{actual}}`);
                    }}
                }},
                toHaveLength: (len) => {{
                    if (!actual || actual.length !== len) {{
                        throw new Error(`Expected length ${{len}}, got ${{actual?.length || 0}}`);
                    }}
                }},
                be: {{
                    below: (limit) => {{
                        if (actual >= limit) {{
                            throw new Error(`Expected ${{actual}} to be below ${{limit}}`);
                        }}
                    }},
                    above: (limit) => {{
                        if (actual <= limit) {{
                            throw new Error(`Expected ${{actual}} to be above ${{limit}}`);
                        }}
                    }},
                }},
            }},
        }}),
        variables: {{
            get: (key) => __vars[key],
            set: (key, value) => {{ __vars[key] = value; }},
            unset: (key) => {{ delete __vars[key]; }},
        }},
        environment: {{
            get: (key) => __vars[key] || env[key],
            set: (key, value) => {{ __vars[key] = value; }},
        }},
    }};

    const request = {req_json};
    const response = {resp_json};
    const env = {env_json};

    try {{
        {script}
    }} catch (e) {{
        __errors.push(`Script error: ${{e.message || e}}${{e.stack ? '\\n' + e.stack : ''}}`);
    }}

    return JSON.stringify({{
        logs: __logs,
        tests: __tests,
        errors: __errors,
        variables: __vars,
    }});
}})()
"#
    );

    let result = execute_js(&wrapped, 5000)?;
    let parsed: serde_json::Value =
        serde_json::from_str(&result).map_err(|e| format!("Failed to parse script output: {}", e))?;

    results.logs = serde_json::from_value(parsed["logs"].clone()).unwrap_or_default();
    results.tests = serde_json::from_value(parsed["tests"].clone()).unwrap_or_default();
    results.errors = serde_json::from_value(parsed["errors"].clone()).unwrap_or_default();

    if let Some(vars) = parsed["variables"].as_object() {
        results.modified_variables = vars
            .iter()
            .map(|(k, v)| KeyValue {
                key: k.clone(),
                value: v.as_str().unwrap_or("").to_string(),
                enabled: true,
                is_secret: false,
            })
            .collect();
    }

    Ok(results)
}

/// Execute a JavaScript string using rquickjs and return the result as a string.
/// `timeout_ms` is the maximum execution time in milliseconds.
fn execute_js(code: &str, timeout_ms: u64) -> Result<String, String> {
    let runtime = rquickjs::Runtime::new().map_err(|e| format!("Failed to create JS runtime: {}", e))?;

    // Set interrupt handler to prevent infinite loops from hanging the app
    let start = std::time::Instant::now();
    runtime.set_interrupt_handler(Some(Box::new(move || {
        if start.elapsed().as_millis() as u64 > timeout_ms {
            true // true = abort execution
        } else {
            false
        }
    })));

    let ctx = rquickjs::Context::full(&runtime).map_err(|e| format!("Failed to create JS context: {}", e))?;

    ctx.with(|ctx| {
        let result: String = ctx
            .eval(code)
            .map_err(|e| format!("JavaScript execution error: {}", e))?;
        Ok(result)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_request() -> HttpRequest {
        HttpRequest {
            id: "test-id".into(),
            name: "Test".into(),
            method: HttpMethod::GET,
            url: "https://example.com/api".into(),
            headers: vec![
                KeyValue { key: "Accept".into(), value: "application/json".into(), enabled: true, is_secret: false },
            ],
            query_params: vec![],
            body_type: BodyType::none,
            body: String::new(),
            form_fields: vec![],
            auth: AuthConfig {
                auth_type: AuthType::none,
                username: String::new(),
                password: String::new(),
                token: String::new(),
                api_key: String::new(),
                api_key_name: String::new(),
                api_key_in: "header".into(),
            },
            settings: RequestSettings {
                timeout: 30,
                follow_redirects: true,
                ssl_verify: true,
                proxy: None,
            },
            pre_script: String::new(),
            post_script: String::new(),
            examples: vec![],
            extractions: vec![],
        }
    }

    fn test_response() -> HttpResponse {
        HttpResponse {
            status: 200,
            status_text: "OK".into(),
            headers: vec![("content-type".into(), "application/json".into())],
            cookies: vec![],
            body: r#"{"userId": 42, "name": "Alice", "roles": ["admin", "user"]}"#.into(),
            body_base64: None,
            size: 50,
            time_ms: 100,
            script_logs: vec![],
            test_results: vec![],
            modified_variables: vec![],
        }
    }

    fn test_env() -> std::collections::HashMap<String, String> {
        let mut m = std::collections::HashMap::new();
        m.insert("BASE_URL".into(), "https://api.example.com".into());
        m.insert("API_KEY".into(), "sk-123".into());
        m
    }

    // ─── execute_pre_request ─────────────────────────────────────

    #[test]
    fn test_pre_request_empty_script_returns_unmodified() {
        let (req, results) = execute_pre_request("", &test_request(), &test_env()).unwrap();
        assert_eq!(req.url, "https://example.com/api");
        assert!(results.logs.is_empty());
        assert!(results.tests.is_empty());
        assert!(results.errors.is_empty());
    }

    #[test]
    fn test_pre_request_modifies_url() {
        let script = "request.url = 'https://modified.com/new-path';";
        let (req, _) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert_eq!(req.url, "https://modified.com/new-path");
    }

    #[test]
    fn test_pre_request_adds_header() {
        let script = r#"
request.headers.push({ key: "X-Custom", value: "test-value", enabled: true, is_secret: false });
"#;
        let (req, _) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert!(req.headers.iter().any(|h| h.key == "X-Custom" && h.value == "test-value"));
    }

    #[test]
    fn test_pre_request_console_log() {
        let script = "console.log('hello', 'world');";
        let (_, results) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert_eq!(results.logs.len(), 1);
        assert_eq!(results.logs[0].level, "log");
        assert!(results.logs[0].message.contains("hello world"));
    }

    #[test]
    fn test_pre_request_script_error_collected() {
        let script = "throw new Error('boom!');";
        let (_, results) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert!(!results.errors.is_empty());
        assert!(results.errors[0].contains("boom!"));
    }

    #[test]
    fn test_pre_request_syntax_error() {
        let script = "invalid {{{ syntax";
        let result = execute_pre_request(script, &test_request(), &test_env());
        assert!(result.is_err());
    }

    #[test]
    fn test_pre_request_sets_variable() {
        let script = r#"pm.variables.set('custom_var', 'custom_value');"#;
        let (_, results) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert!(results.modified_variables.iter().any(|kv| kv.key == "custom_var" && kv.value == "custom_value"));
    }

    #[test]
    fn test_pre_request_reads_env_variable() {
        let script = r#"const base = pm.environment.get('BASE_URL'); console.log(base);"#;
        let (_, results) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert!(!results.logs.is_empty());
        assert!(results.logs[0].message.contains("https://api.example.com"));
    }

    // ─── execute_post_response ───────────────────────────────────

    #[test]
    fn test_post_response_empty_script_returns_empty() {
        let results = execute_post_response("", &test_request(), &test_response(), &test_env()).unwrap();
        assert!(results.logs.is_empty());
        assert!(results.tests.is_empty());
    }

    #[test]
    fn test_post_response_passing_test() {
        let script = r#"pm.test('status is 200', () => { pm.expect(response.status).to.equal(200); });"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert_eq!(results.tests.len(), 1);
        assert!(results.tests[0].passed);
        assert_eq!(results.tests[0].name, "status is 200");
    }

    #[test]
    fn test_post_response_failing_test() {
        let script = r#"pm.test('body has name', () => {
            const body = JSON.parse(response.body);
            pm.expect(body.name).to.equal('Bob');
        });"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert_eq!(results.tests.len(), 1);
        assert!(!results.tests[0].passed);
    }

    #[test]
    fn test_post_response_multiple_tests() {
        let script = r#"
pm.test('test a', () => { pm.expect(1).to.equal(1); });
pm.test('test b', () => { pm.expect(2).to.equal(2); });
pm.test('test c', () => { pm.expect(3).to.equal(4); });
"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert_eq!(results.tests.len(), 3);
        assert_eq!(results.tests.iter().filter(|t| t.passed).count(), 2);
        assert_eq!(results.tests.iter().filter(|t| !t.passed).count(), 1);
    }

    #[test]
    fn test_post_response_expect_include() {
        let script = r#"pm.test('body includes Alice', () => { pm.expect(response.body).to.include('Alice'); });"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert_eq!(results.tests.len(), 1);
        assert!(results.tests[0].passed);
    }

    #[test]
    fn test_post_response_expect_to_have_length() {
        // The JS wrapper uses toHaveLength (camelCase), not haveLength
        let script = r#"pm.test('arr length', () => {
            const body = JSON.parse(response.body);
            pm.expect(body.roles).to.toHaveLength(2);
        });"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert_eq!(results.tests.len(), 1);
        assert!(results.tests[0].passed, "toHaveLength: errors={:?}, logs={:?}", results.errors, results.logs);
    }

    #[test]
    fn test_post_response_json_body_parsing() {
        let script = r#"pm.test('body has Alice', () => {
            const body = JSON.parse(response.body);
            pm.expect(body.name).to.equal('Alice');
        });"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert_eq!(results.tests.len(), 1);
        assert!(results.tests[0].passed, "JSON body parsing test: errors={:?}, logs={:?}", results.errors, results.logs);
    }

    #[test]
    fn test_post_response_sets_variable() {
        let script = r#"pm.variables.set('extracted_id', '42');"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert!(results.modified_variables.iter().any(|kv| kv.key == "extracted_id" && kv.value == "42"));
    }

    #[test]
    fn test_post_response_console_log() {
        let script = r#"console.log('Status:', response.status);"#;
        let results = execute_post_response(script, &test_request(), &test_response(), &test_env()).unwrap();
        assert!(!results.logs.is_empty());
        assert!(results.logs[0].message.contains("200"));
    }

    // ─── execute_extractions ─────────────────────────────────────

    #[test]
    fn test_extractions_empty_list_returns_empty() {
        let results = execute_extractions(&[], "{}").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_extractions_simple_jsonpath() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "user id".into(),
                expression: "$.userId".into(),
                target_variable: "uid".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(&extractions, r#"{"userId": 42}"#).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "uid");
        assert_eq!(results[0].1, "42");
    }

    #[test]
    fn test_extractions_nested_jsonpath() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "name".into(),
                expression: "$.user.profile.name".into(),
                target_variable: "user_name".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(
            &extractions,
            r#"{"user": {"profile": {"name": "Bob"}}}"#,
        ).unwrap();
        assert_eq!(results[0].1, "Bob");
    }

    #[test]
    fn test_extractions_array_index() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "first role".into(),
                expression: "$.roles[0]".into(),
                target_variable: "role".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(
            &extractions,
            r#"{"roles": ["admin", "user"]}"#,
        ).unwrap();
        assert_eq!(results[0].1, "admin");
    }

    #[test]
    fn test_extractions_bracket_notation() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "name".into(),
                expression: r#"$['user']['name']"#.into(),
                target_variable: "n".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(
            &extractions,
            r#"{"user": {"name": "Charlie"}}"#,
        ).unwrap();
        assert_eq!(results[0].1, "Charlie");
    }

    #[test]
    fn test_extractions_disabled_skipped() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "disabled".into(),
                expression: "$.userId".into(),
                target_variable: "uid".into(),
                enabled: false,
            },
        ];
        let results = execute_extractions(&extractions, r#"{"userId": 42}"#).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_extractions_non_json_body_returns_empty() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "test".into(),
                expression: "$.key".into(),
                target_variable: "v".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(&extractions, "not-json").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_extractions_missing_path_skipped() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "missing".into(),
                expression: "$.nonexistent.path".into(),
                target_variable: "v".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(&extractions, r#"{"key": "value"}"#).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_extractions_multiple_extractions() {
        let extractions = vec![
            VariableExtraction {
                id: "e1".into(),
                name: "id".into(),
                expression: "$.id".into(),
                target_variable: "ext_id".into(),
                enabled: true,
            },
            VariableExtraction {
                id: "e2".into(),
                name: "name".into(),
                expression: "$.name".into(),
                target_variable: "ext_name".into(),
                enabled: true,
            },
        ];
        let results = execute_extractions(&extractions, r#"{"id": 1, "name": "Test"}"#).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].1, "1");
        assert_eq!(results[1].1, "Test");
    }

    #[test]
    fn test_execute_js_returns_valid_json() {
        // Direct execution of the private execute_js via a public wrapper
        // We test through execute_pre_request with a script that returns via console
        let script = "console.log('direct test');";
        let (_, results) = execute_pre_request(script, &test_request(), &test_env()).unwrap();
        assert!(results.logs.iter().any(|l| l.message.contains("direct test")));
    }
}
