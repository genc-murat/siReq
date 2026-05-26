use crate::models::*;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

/// Parses an OpenAPI/Swagger spec (JSON or YAML) and returns a collection of requests.
pub fn parse_openapi(spec_content: &str, collection_name: &str) -> Result<Collection, String> {
    // Try JSON first, then YAML
    let spec: Value = serde_json::from_str(spec_content)
        .or_else(|_| serde_yaml::from_str(spec_content))
        .map_err(|e| format!("Failed to parse spec: {}. Must be valid JSON or YAML.", e))?;

    // Determine if it's OpenAPI 2.0 (swagger) or 3.x (openapi)
    let is_v2 = spec.get("swagger").and_then(|s| s.as_str()).is_some();
    let is_v3 = spec.get("openapi").and_then(|s| s.as_str()).is_some();

    if !is_v2 && !is_v3 {
        return Err("Spec does not appear to be a valid OpenAPI/Swagger document (no 'swagger' or 'openapi' field)".to_string());
    }

    // Build base URL
    let base_url = if is_v3 {
        build_base_url_v3(&spec)
    } else {
        build_base_url_v2(&spec)
    };

    // Parse security schemes for auth context
    let security_schemes = if is_v3 {
        parse_security_schemes_v3(&spec)
    } else {
        parse_security_schemes_v2(&spec)
    };

    // Parse global security requirements (applies to all operations unless overridden)
    let global_security = spec
        .get("security")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();

    // Parse paths
    let paths = spec
        .get("paths")
        .and_then(|p| p.as_object())
        .ok_or_else(|| "Spec has no 'paths' field".to_string())?;

    let mut requests: Vec<HttpRequest> = Vec::new();

    for (path, path_item) in paths {
        // Collect path-level parameters (apply to all operations under this path)
        let path_params = path_item
            .get("parameters")
            .and_then(|p| p.as_array())
            .cloned()
            .unwrap_or_default();

        let methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
        for method_str in &methods {
            if let Some(operation) = path_item.get(*method_str) {
                if let Some(req) = parse_operation(
                    operation,
                    method_str,
                    path,
                    &base_url,
                    &security_schemes,
                    &global_security,
                    &path_params,
                    &spec,
                ) {
                    requests.push(req);
                }
            }
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    Ok(Collection {
        id: Uuid::new_v4().to_string(),
        name: collection_name.to_string(),
        items: requests.into_iter().map(CollectionItem::Request).collect(),
        created_at: now.clone(),
        updated_at: now,
        variables: vec![],
        auth: None,
        description: String::new(),
    })
}

fn build_base_url_v2(spec: &Value) -> String {
    let host = spec.get("host").and_then(|h| h.as_str()).unwrap_or("localhost");
    let base_path = spec
        .get("basePath")
        .and_then(|b| b.as_str())
        .unwrap_or("");
    let scheme = spec
        .get("schemes")
        .and_then(|s| s.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("https");

    let path = base_path.trim_end_matches('/');
    format!("{}://{}{}", scheme, host, path)
}

fn build_base_url_v3(spec: &Value) -> String {
    if let Some(servers) = spec.get("servers").and_then(|s| s.as_array()) {
        if let Some(first) = servers.first() {
            if let Some(url) = first.get("url").and_then(|u| u.as_str()) {
                let cleaned = url
                    .split(['{', '}'])
                    .enumerate()
                    .filter_map(|(i, part)| if i % 2 == 0 { Some(part) } else { None })
                    .collect::<Vec<_>>()
                    .join("");
                return cleaned.trim_end_matches('/').to_string();
            }
        }
    }
    String::new()
}

fn parse_security_schemes_v2(spec: &Value) -> HashMap<String, Value> {
    let mut schemes = HashMap::new();
    if let Some(defs) = spec
        .get("securityDefinitions")
        .and_then(|d| d.as_object())
    {
        for (name, def) in defs {
            schemes.insert(name.clone(), def.clone());
        }
    }
    schemes
}

fn parse_security_schemes_v3(spec: &Value) -> HashMap<String, Value> {
    let mut schemes = HashMap::new();
    if let Some(components) = spec.get("components").and_then(|c| c.as_object()) {
        if let Some(sec) = components.get("securitySchemes").and_then(|s| s.as_object()) {
            for (name, def) in sec {
                schemes.insert(name.clone(), def.clone());
            }
        }
    }
    schemes
}

#[allow(clippy::too_many_arguments)]
fn parse_operation(
    operation: &Value,
    method_str: &str,
    path: &str,
    base_url: &str,
    security_schemes: &HashMap<String, Value>,
    global_security: &[Value],
    path_level_params: &[Value],
    spec: &Value,
) -> Option<HttpRequest> {
    let summary = operation
        .get("summary")
        .and_then(|s| s.as_str())
        .unwrap_or("");
    let description = operation
        .get("description")
        .and_then(|s| s.as_str())
        .unwrap_or("");

    let name = if !summary.is_empty() {
        summary.to_string()
    } else if !description.is_empty() {
        description.to_string()
    } else {
        format!("{} {}", method_str.to_uppercase(), path)
    };

    // Merge path-level and operation-level parameters (operation overrides path-level)
    let operation_params = operation
        .get("parameters")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();

    let mut all_params: Vec<&Value> = path_level_params.iter().collect();
    for op_param in &operation_params {
        let op_name = op_param.get("name").and_then(|n| n.as_str()).unwrap_or("");
        let op_in = op_param.get("in").and_then(|i| i.as_str()).unwrap_or("");
        all_params.retain(|p| {
            let pn = p.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let pi = p.get("in").and_then(|i| i.as_str()).unwrap_or("");
            !(pn == op_name && pi == op_in)
        });
        all_params.push(op_param);
    }

    let mut headers: Vec<KeyValue> = Vec::new();
    let mut query_params: Vec<KeyValue> = Vec::new();

    for param in all_params {
        let p_in = param
            .get("in")
            .and_then(|i| i.as_str())
            .unwrap_or("");
        let p_name = param
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("");

        match p_in {
            "header" => {
                headers.push(KeyValue {
                    key: p_name.to_string(),
                    value: get_example_value(param, spec),
                    enabled: true,
                    is_secret: false,
                });
            }
            "query" => {
                query_params.push(KeyValue {
                    key: p_name.to_string(),
                    value: get_example_value(param, spec),
                    enabled: true,
                    is_secret: false,
                });
            }
            "path" => {}
            _ => {}
        }
    }

    // Build the URL
    let url_path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{}", path)
    };

    let full_url = if base_url.is_empty() {
        format!("http://localhost{}", url_path)
    } else {
        format!("{}{}", base_url.trim_end_matches('/'), url_path)
    };

    // Parse request body and content type (single pass in get_body_for_operation)
    let (body_type, body, content_type) = get_body_for_operation(operation, spec);

    // Map method string to HttpMethod
    let method = match method_str.to_lowercase().as_str() {
        "get" => HttpMethod::GET,
        "post" => HttpMethod::POST,
        "put" => HttpMethod::PUT,
        "patch" => HttpMethod::PATCH,
        "delete" => HttpMethod::DELETE,
        "head" => HttpMethod::HEAD,
        "options" => HttpMethod::OPTIONS,
        "trace" => HttpMethod::TRACE,
        _ => return None,
    };

    // If GET/HEAD/DELETE, force body_type to none
    let (final_body_type, final_body) = match method {
        HttpMethod::GET | HttpMethod::HEAD | HttpMethod::DELETE => (BodyType::none, String::new()),
        _ => (body_type, body),
    };

    // Add Content-Type header if there's a body and one isn't already set
    if final_body_type != BodyType::none && !content_type.is_empty()
        && !headers.iter().any(|h| h.key.to_lowercase() == "content-type")
    {
        headers.push(KeyValue {
            key: "Content-Type".to_string(),
            value: content_type,
            enabled: true,
            is_secret: false,
        });
    }

    Some(HttpRequest {
        id: Uuid::new_v4().to_string(),
        name,
        method,
        url: full_url,
        headers,
        query_params,
        body_type: final_body_type,
        body: final_body,
        form_fields: vec![],
        auth: get_auth_for_operation(operation, global_security, security_schemes),
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
    })
}

// ---------------------------------------------------------------------------
// Security scheme → AuthConfig mapping
// ---------------------------------------------------------------------------

/// Determine the effective auth configuration for an operation based on:
/// 1. Operation-level `security` field (if present)
/// 2. Global `security` field (fallback)
/// 3. Empty `security: []` means no auth for this operation
/// 4. No security anywhere means no auth
fn get_auth_for_operation(
    operation: &Value,
    global_security: &[Value],
    schemes: &HashMap<String, Value>,
) -> AuthConfig {
    // Get operation-level security, or fall back to global
    let security_req = operation
        .get("security")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_else(|| global_security.to_vec());

    // Empty security array means no auth (explicit opt-out)
    if security_req.is_empty() {
        return AuthConfig {
            auth_type: AuthType::none,
            username: String::new(),
            password: String::new(),
            token: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
        };
    }

    // Try the first security requirement
    if let Some(first_req) = security_req.first().and_then(|r| r.as_object()) {
        for (scheme_name, _scopes) in first_req {
            if let Some(def) = schemes.get(scheme_name) {
                if let Some(auth) = map_scheme_to_auth(def) {
                    return auth;
                }
            }
            // Try the next scheme in this requirement
        }
    }

    // No matching scheme found — default to no auth
    AuthConfig {
        auth_type: AuthType::none,
        username: String::new(),
        password: String::new(),
        token: String::new(),
        api_key: String::new(),
        api_key_name: String::new(),
        api_key_in: "header".to_string(),
    }
}

/// Map a single security scheme definition to an AuthConfig.
fn map_scheme_to_auth(def: &Value) -> Option<AuthConfig> {
    let stype = def.get("type").and_then(|t| t.as_str()).unwrap_or("");
    match stype {
        "apiKey" => {
            let name = def.get("name").and_then(|n| n.as_str()).unwrap_or("api_key").to_string();
            let location = def.get("in").and_then(|i| i.as_str()).unwrap_or("header").to_string();
            Some(AuthConfig {
                auth_type: AuthType::api_key,
                api_key: format!("{{{{{}}}}}", name.to_uppercase()),
                api_key_name: name,
                api_key_in: if location == "query" { "query".to_string() } else { "header".to_string() },
                username: String::new(),
                password: String::new(),
                token: String::new(),
            })
        }
        "http" => {
            let scheme = def.get("scheme").and_then(|s| s.as_str()).unwrap_or("");
            match scheme {
                "basic" => Some(AuthConfig {
                    auth_type: AuthType::basic,
                    username: "username".to_string(),
                    password: "password".to_string(),
                    token: String::new(),
                    api_key: String::new(),
                    api_key_name: String::new(),
                    api_key_in: "header".to_string(),
                }),
                "bearer" => Some(AuthConfig {
                    auth_type: AuthType::bearer,
                    token: "{{TOKEN}}".to_string(),
                    username: String::new(),
                    password: String::new(),
                    api_key: String::new(),
                    api_key_name: String::new(),
                    api_key_in: "header".to_string(),
                }),
                _ => None, // digest, negotiate, etc. — can't auto-configure
            }
        }
        "basic" => {
            // v2 style basic (type: basic, no scheme field)
            Some(AuthConfig {
                auth_type: AuthType::basic,
                username: "username".to_string(),
                password: "password".to_string(),
                token: String::new(),
                api_key: String::new(),
                api_key_name: String::new(),
                api_key_in: "header".to_string(),
            })
        }
        "oauth2" | "openIdConnect" => {
            // Both result in a bearer token — provide a placeholder
            Some(AuthConfig {
                auth_type: AuthType::bearer,
                token: "{{OAUTH_TOKEN}}".to_string(),
                username: String::new(),
                password: String::new(),
                api_key: String::new(),
                api_key_name: String::new(),
                api_key_in: "header".to_string(),
            })
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

/// Resolve a `$ref` string like `#/components/schemas/Pet` against the spec root.
/// Returns the referenced Value, or None if the path can't be traversed.
fn resolve_ref<'a>(spec: &'a Value, ref_path: &str) -> Option<&'a Value> {
    // Only handle internal refs (no protocol/host prefix)
    let fragment = ref_path.strip_prefix('#')?;
    if fragment.is_empty() {
        return Some(spec);
    }
    // Split on '/' and skip empty parts
    let parts: Vec<&str> = fragment
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return Some(spec);
    }
    // Navigate the tree
    let mut current = spec;
    for part in parts {
        // JSON Pointer uses ~1 for / and ~0 for ~
        let decoded = part
            .replace("~1", "/")
            .replace("~0", "~");
        current = current.get(&decoded)?;
    }
    Some(current)
}

/// Fully resolve a schema: follows `$ref`, handles `allOf`/`oneOf`/`anyOf`.
/// Returns a merged schema Value.
/// `resolving` tracks circular refs to prevent infinite loops.
pub fn resolve_schema<'a>(
    spec: &'a Value,
    schema: &'a Value,
    resolving: &mut HashSet<String>,
    depth: usize,
) -> Option<Value> {
    if depth > 20 {
        return None; // safety limit
    }

    // If it has a $ref, resolve it
    if let Some(ref_path) = schema.get("$ref").and_then(|r| r.as_str()) {
        if !resolving.insert(ref_path.to_string()) {
            // Circular reference detected — return placeholder
            return Some(Value::Object(serde_json::Map::new()));
        }
        let resolved = resolve_ref(spec, ref_path)?;
        // Apply the resolved schema on top of any sibling properties (inlined overrides)
        let mut merged = resolve_schema(spec, resolved, resolving, depth + 1)
            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
        // Merge sibling properties from the original schema onto the resolved one
        if let (Some(resolved_obj), Some(schema_obj)) =
            (merged.as_object_mut(), schema.as_object())
        {
            for (k, v) in schema_obj {
                if k != "$ref" {
                    resolved_obj.insert(k.clone(), v.clone());
                }
            }
        }
        resolving.remove(ref_path);
        return Some(merged);
    }

    // Handle allOf: merge all sub-schemas
    if let Some(all_of) = schema.get("allOf").and_then(|a| a.as_array()) {
        let mut merged = serde_json::Map::new();
        for sub in all_of {
            if let Some(sub_resolved) = resolve_schema(spec, sub, resolving, depth + 1) {
                merge_schemas_into(&mut merged, &sub_resolved);
            }
        }
        // Also merge any direct properties from the parent schema
        if let Some(obj) = schema.as_object() {
            for (k, v) in obj {
                if k != "allOf" {
                    merged.insert(k.clone(), v.clone());
                }
            }
        }
        return Some(Value::Object(merged));
    }

    // Handle oneOf: use the first schema
    if let Some(one_of) = schema.get("oneOf").and_then(|a| a.as_array()) {
        if let Some(first) = one_of.first() {
            return resolve_schema(spec, first, resolving, depth + 1);
        }
    }

    // Handle anyOf: use the first schema
    if let Some(any_of) = schema.get("anyOf").and_then(|a| a.as_array()) {
        if let Some(first) = any_of.first() {
            return resolve_schema(spec, first, resolving, depth + 1);
        }
    }

    // Handle not: return a generic object (hard to invert)
    if schema.get("not").is_some() {
        return Some(Value::Object(serde_json::Map::new()));
    }

    // No ref or composition — return as-is
    Some(schema.clone())
}

/// Merge properties from `source` into `target` (target takes precedence).
fn merge_schemas_into(target: &mut serde_json::Map<String, Value>, source: &Value) {
    if let Some(source_obj) = source.as_object() {
        for (k, v) in source_obj {
            // If both have "properties", merge them deeply
            if k == "properties" {
                if let (Some(target_props), Some(source_props)) =
                    (target.get_mut("properties").and_then(|p| p.as_object_mut()), v.as_object())
                {
                    for (pk, pv) in source_props {
                        target_props.entry(pk.clone()).or_insert_with(|| pv.clone());
                    }
                    continue;
                }
            }
            // For "required" arrays, merge unique values
            if k == "required" {
                if let (Some(target_req), Some(source_req)) =
                    (target.get_mut("required").and_then(|r| r.as_array_mut()), v.as_array())
                {
                    for item in source_req {
                        if !target_req.contains(item) {
                            target_req.push(item.clone());
                        }
                    }
                    continue;
                }
            }
            // For all other keys, target already has it → keep target
            if target.contains_key(k) {
                continue;
            }
            target.insert(k.clone(), v.clone());
        }
    }
}

// ---------------------------------------------------------------------------
// Example value generation
// ---------------------------------------------------------------------------

fn get_example_value(param: &Value, spec: &Value) -> String {
    // Try example from the param itself
    if let Some(example) = param.get("example").and_then(|e| e.as_str()) {
        return example.to_string();
    }
    if let Some(examples) = param.get("examples") {
        if let Some(first) = examples.as_object().and_then(|o| o.values().next()) {
            if let Some(val) = first.get("value").and_then(|v| v.as_str()) {
                return val.to_string();
            }
        }
    }
    // Try default
    if let Some(default) = param.get("default").and_then(|d| d.as_str()) {
        return default.to_string();
    }

    // Try to find schema and resolve it
    if let Some(schema) = param.get("schema") {
        let mut resolving = HashSet::new();
        if let Some(resolved) = resolve_schema(spec, schema, &mut resolving, 0) {
            return generate_scalar_example(&resolved, spec);
        }
    }

    // Fallback: try type directly on param (v2 style)
    match param.get("type").and_then(|t| t.as_str()) {
        Some("string") => {
            let enum_vals = param.get("enum").and_then(|e| e.as_array());
            if let Some(vals) = enum_vals {
                if let Some(first) = vals.first().and_then(|v| v.as_str()) {
                    return first.to_string();
                }
            }
            match param.get("format").and_then(|f| f.as_str()) {
                Some("email") => "user@example.com".to_string(),
                Some("uri" | "url") => "https://example.com".to_string(),
                Some("date") => "2024-01-01".to_string(),
                Some("date-time") => "2024-01-01T00:00:00Z".to_string(),
                Some("byte") => "dGVzdA==".to_string(),
                Some("binary") => "(binary)".to_string(),
                _ => "string".to_string(),
            }
        }
        Some("integer" | "number") => "1".to_string(),
        Some("boolean") => "true".to_string(),
        Some("array") => "[]".to_string(),
        Some("object") => "{}".to_string(),
        _ => "".to_string(),
    }
}

fn generate_scalar_example(schema: &Value, spec: &Value) -> String {
    // Resolve $ref and composition if needed
    let mut resolving = HashSet::new();
    let resolved = resolve_schema(spec, schema, &mut resolving, 0);

    let effective = resolved.as_ref().unwrap_or(schema);

    match effective.get("type").and_then(|t| t.as_str()) {
        Some("string") => {
            match effective.get("format").and_then(|f| f.as_str()) {
                Some("email") => "user@example.com".to_string(),
                Some("uri" | "url") => "https://example.com".to_string(),
                Some("date") => "2024-01-01".to_string(),
                Some("date-time") => "2024-01-01T00:00:00Z".to_string(),
                Some("byte") => "dGVzdA==".to_string(),
                Some("binary") => "(binary)".to_string(),
                _ => {
                    if let Some(enum_vals) = effective.get("enum").and_then(|e| e.as_array()) {
                        if let Some(first) = enum_vals.first().and_then(|v| v.as_str()) {
                            return first.to_string();
                        }
                    }
                    "string".to_string()
                }
            }
        }
        Some("integer") => "1".to_string(),
        Some("number") => "1.0".to_string(),
        Some("boolean") => "true".to_string(),
        Some("array") => {
            if let Some(items) = effective.get("items") {
                let ex = generate_scalar_example(items, spec);
                format!("[{}]", ex)
            } else {
                "[]".to_string()
            }
        }
        Some("object") => {
            generate_example_body_with_spec(effective, spec)
        }
        _ => {
            // If the resolved schema has properties (some $ref targets are pure objects)
            if effective.get("properties").is_some() {
                generate_example_body_with_spec(effective, spec)
            } else {
                "{}".to_string()
            }
        }
    }
}

pub fn generate_example_body_with_spec(schema: &Value, spec: &Value) -> String {
    // Resolve $ref and composition
    let mut resolving = HashSet::new();
    let resolved = resolve_schema(spec, schema, &mut resolving, 0);
    let effective = resolved.as_ref().unwrap_or(schema);

    // Check if it's an array
    if effective.get("type").and_then(|t| t.as_str()) == Some("array") {
        if let Some(items) = effective.get("items") {
            let ex = generate_example_body_with_spec(items, spec);
            return format!("[\n  {}\n]", ex);
        }
        return "[]".to_string();
    }

    // Build example object from properties
    let mut map = serde_json::Map::new();
    if let Some(props) = effective.get("properties").and_then(|p| p.as_object()) {
        for (key, prop_schema) in props {
            // Resolve this property's schema using the shared resolving set
            // to detect circular refs across sibling properties
            let prop_resolved = resolve_schema(spec, prop_schema, &mut resolving, 0);
            let prop_effective = prop_resolved.as_ref().unwrap_or(prop_schema);

            let val = generate_scalar_example(prop_effective, spec);
            if let Ok(v) = serde_json::from_str::<Value>(&val) {
                map.insert(key.clone(), v);
            } else {
                map.insert(key.clone(), Value::String(val));
            }
        }
    }

    // Also handle additionalProperties with a wildcard example
    if let Some(additional) = effective.get("additionalProperties") {
        if additional.as_bool().is_none() {
            let val = generate_scalar_example(additional, spec);
            if let Ok(v) = serde_json::from_str::<Value>(&val) {
                if !map.contains_key("additionalProp") {
                    map.insert("additionalProp".to_string(), v);
                }
            }
        }
    }

    serde_json::to_string_pretty(&Value::Object(map)).unwrap_or_else(|_| "{}".to_string())
}

fn get_body_for_operation(operation: &Value, spec: &Value) -> (BodyType, String, String) {
    // Check v2: look for body parameter
    if let Some(params) = operation.get("parameters").and_then(|p| p.as_array()) {
        for param in params {
            if param.get("in").and_then(|i| i.as_str()) == Some("body") {
                if let Some(schema) = param.get("schema") {
                    let body = generate_example_body_with_spec(schema, spec);
                    if !body.is_empty() {
                        return (BodyType::json, body, "application/json".to_string());
                    }
                }
            }
        }
    }

    // Check v3: requestBody
    if let Some(request_body) = operation.get("requestBody") {
        if let Some(content) = request_body.get("content").and_then(|c| c.as_object()) {
            // Prefer application/json
            if let Some(json_media) = content.get("application/json") {
                if let Some(schema) = json_media.get("schema") {
                    let body = generate_example_body_with_spec(schema, spec);
                    if !body.is_empty() {
                        return (BodyType::json, body, "application/json".to_string());
                    }
                }
            }
            // Try any other content type
            for (ct, media_type) in content {
                if let Some(schema) = media_type.get("schema") {
                    let body = generate_example_body_with_spec(schema, spec);
                    if !body.is_empty() {
                        let body_type = if ct.contains("json") {
                            BodyType::json
                        } else if ct.contains("xml") {
                            BodyType::xml
                        } else if ct.contains("form-data") {
                            BodyType::form
                        } else if ct.contains("x-www-form-urlencoded") {
                            BodyType::form_urlencoded
                        } else {
                            BodyType::json
                        };
                        return (body_type, body, ct.clone());
                    }
                }
            }
        }
    }

    (BodyType::none, String::new(), String::new())
}
