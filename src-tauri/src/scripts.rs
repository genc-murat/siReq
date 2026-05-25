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
            })
            .collect();
    }

    Ok((modified_request, results))
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
