use rand::Rng;
use std::collections::HashMap;
use crate::models::{HttpRequest, KeyValue};

/// Resolve dynamic/built-in variables in a string.
/// Supports: {{$timestamp}}, {{$uuid}}, {{$guid}}, {{$randomInt}}, {{$randomInt N,M}},
/// {{$randomString}}, {{$randomString N}}, {{$randomEmail}}
pub fn resolve_dynamic_vars(input: &str) -> String {
    let mut result = input.to_string();

    // $timestamp — current Unix timestamp in milliseconds
    let ts = chrono::Utc::now().timestamp_millis().to_string();
    result = result.replace("{{$timestamp}}", &ts);
    result = result.replace("{{$timestamp ms}}", &ts);

    // $uuid / $guid — random UUID v4
    let uuid = uuid::Uuid::new_v4().to_string();
    result = result.replace("{{$uuid}}", &uuid);
    result = result.replace("{{$guid}}", &uuid);

    // $randomInt — random integer 0-1000
    let mut rng = rand::thread_rng();
    let rand_int = rng.gen_range(0..=1000);
    result = replace_with_capture(&result, "{{$randomInt}}", &rand_int.to_string(), true);

    // $randomInt N,M — random integer in range [N, M]
    // Match pattern: {{$randomInt D,D}} or {{$randomInt D, D}} etc.
    result = replace_random_int_range(&result);

    // $randomString — random 8-char alphanumeric
    let rand_str = random_string(8);
    result = replace_with_capture(&result, "{{$randomString}}", &rand_str, true);

    // $randomString N — random N-char alphanumeric
    result = replace_random_string_length(&result);

    // $randomEmail — random email
    let email = format!("{}@example.com", random_string(10).to_lowercase());
    result = replace_with_capture(&result, "{{$randomEmail}}", &email, true);

    result
}

/// Simple replacement that only replaces the first occurrence (for random vars that should differ).
fn replace_with_capture(text: &str, pattern: &str, replacement: &str, first_only: bool) -> String {
    if first_only {
        if let Some(pos) = text.find(pattern) {
            let (before, after) = text.split_at(pos);
            return format!("{}{}{}", before, replacement, &after[pattern.len()..]);
        }
        text.to_string()
    } else {
        text.replace(pattern, replacement)
    }
}

/// Replace {{$randomInt N,M}} patterns.
fn replace_random_int_range(text: &str) -> String {
    let mut result = text.to_string();
    let pattern_start = "{{$randomInt ";
    let pattern_end = "}}";

    while let Some(start) = result.find(pattern_start) {
        let after_start = &result[start + pattern_start.len()..];
        let Some(end) = after_start.find(pattern_end) else {
            break;
        };

        let range_str = &after_start[..end];
        let parts: Vec<&str> = range_str.split(',').map(|s| s.trim()).collect();

        if parts.len() == 2 {
            let min = parts[0].parse::<i64>().unwrap_or(0);
            let max = parts[1].parse::<i64>().unwrap_or(100);
            let mut rng = rand::thread_rng();
            let value = if min <= max {
                rng.gen_range(min..=max)
            } else {
                rng.gen_range(max..=min)
            };

            let full_pattern = format!("{}{}{}", pattern_start, range_str, pattern_end);
            result = result.replacen(&full_pattern, &value.to_string(), 1);
        } else {
            break;
        }
    }

    result
}

/// Replace {{$randomString N}} patterns.
fn replace_random_string_length(text: &str) -> String {
    let mut result = text.to_string();
    let pattern_start = "{{$randomString ";
    let pattern_end = "}}";

    while let Some(start) = result.find(pattern_start) {
        let after_start = &result[start + pattern_start.len()..];
        let Some(end) = after_start.find(pattern_end) else {
            break;
        };

        let len_str = &after_start[..end].trim();
        let length = len_str.parse::<usize>().unwrap_or(8).clamp(1, 256);
        let value = random_string(length);

        let full_pattern = format!("{}{}{}", pattern_start, len_str, pattern_end);
        result = result.replacen(&full_pattern, &value, 1);
    }

    result
}

/// Generate a random alphanumeric string of the given length.
fn random_string(length: usize) -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Build a merged variable map from all scopes.
/// Priority (highest wins): script_vars > env_vars > collection_vars > global_vars > dynamic_vars
///
/// `dynamic_vars` are `{{$timestamp}}`, etc. — they are resolved first as a base layer.
/// Then global, collection, env, and script variables are layered on top.
pub fn build_variable_map(
    global_vars: &[KeyValue],
    collection_vars: &[KeyValue],
    env_vars: &HashMap<String, String>,
    script_vars: &[KeyValue],
) -> HashMap<String, String> {
    let mut map = HashMap::new();

    // Layer 1: Global variables
    for kv in global_vars {
        if kv.enabled && !kv.key.is_empty() {
            map.insert(kv.key.clone(), kv.value.clone());
        }
    }

    // Layer 2: Collection variables (overrides global)
    for kv in collection_vars {
        if kv.enabled && !kv.key.is_empty() {
            map.insert(kv.key.clone(), kv.value.clone());
        }
    }

    // Layer 3: Environment variables (overrides collection and global)
    for (key, value) in env_vars {
        map.insert(key.clone(), value.clone());
    }

    // Layer 4: Script variables (highest priority — overrides everything)
    for kv in script_vars {
        if kv.enabled && !kv.key.is_empty() {
            map.insert(kv.key.clone(), kv.value.clone());
        }
    }

    map
}

/// Apply all variable substitution to a request.
/// First resolves dynamic vars in the raw request, then applies the merged variable map.
pub fn apply_variables(
    request: &HttpRequest,
    global_vars: &[KeyValue],
    collection_vars: &[KeyValue],
    env_vars: &HashMap<String, String>,
    script_vars: &[KeyValue],
) -> HttpRequest {
    // First, resolve dynamic variables in the raw request
    let mut dynamic_resolved = request.clone();
    dynamic_resolved.url = resolve_dynamic_vars(&dynamic_resolved.url);
    dynamic_resolved.body = resolve_dynamic_vars(&dynamic_resolved.body);
    dynamic_resolved.headers = dynamic_resolved.headers.into_iter().map(|mut h| {
        h.key = resolve_dynamic_vars(&h.key);
        h.value = resolve_dynamic_vars(&h.value);
        h
    }).collect();
    dynamic_resolved.query_params = dynamic_resolved.query_params.into_iter().map(|mut p| {
        p.key = resolve_dynamic_vars(&p.key);
        p.value = resolve_dynamic_vars(&p.value);
        p
    }).collect();

    // Build merged variable map
    let merged = build_variable_map(global_vars, collection_vars, env_vars, script_vars);

    // Apply substitution
    let mut req = dynamic_resolved;
    req.url = substitute_vars(&req.url, &merged);
    req.body = substitute_vars(&req.body, &merged);
    req.headers = req.headers.into_iter().map(|mut h| {
        h.key = substitute_vars(&h.key, &merged);
        h.value = substitute_vars(&h.value, &merged);
        h
    }).collect();
    req.query_params = req.query_params.into_iter().map(|mut p| {
        p.key = substitute_vars(&p.key, &merged);
        p.value = substitute_vars(&p.value, &merged);
        p
    }).collect();

    req
}

/// Simple {{KEY}} substitution.
fn substitute_vars(input: &str, vars: &HashMap<String, String>) -> String {
    let mut result = input.to_string();
    for (key, value) in vars {
        let pattern = format!("{{{{{}}}}}", key);
        result = result.replace(&pattern, value);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuthConfig, AuthType, BodyType, HttpMethod, RequestSettings};

    // Helper to create a minimal HttpRequest for tests
    fn make_request(
        url: &str,
        method: HttpMethod,
        headers: Vec<KeyValue>,
        query_params: Vec<KeyValue>,
        body: &str,
    ) -> HttpRequest {
        HttpRequest {
            id: String::new(),
            name: String::new(),
            method,
            url: url.into(),
            headers,
            query_params,
            body_type: BodyType::none,
            body: body.into(),
            form_fields: vec![],
            auth: AuthConfig {
                auth_type: AuthType::none,
                username: String::new(),
                password: String::new(),
                token: String::new(),
                api_key: String::new(),
                api_key_name: String::new(),
                api_key_in: String::new(),
            },
            settings: RequestSettings {
                timeout: 30000,
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

    #[test]
    fn test_resolve_timestamp() {
        let result = resolve_dynamic_vars("prefix_{{ $timestamp }}_suffix");
        // $timestamp should not match {{ $timestamp }} because there's a space
        // Our implementation replaces {{$timestamp}} without spaces
        assert_eq!(result, "prefix_{{ $timestamp }}_suffix");
    }

    #[test]
    fn test_resolve_uuid() {
        let result = resolve_dynamic_vars("id={{$uuid}}");
        assert!(result.starts_with("id="));
        assert_eq!(result.len(), 39); // "id=" (3) + 36 chars for UUID
    }

    #[test]
    fn test_resolve_random_int() {
        let result = resolve_dynamic_vars("num={{$randomInt}}");
        assert!(result.starts_with("num="));
        let val: i32 = result[4..].parse().unwrap();
        assert!((0..=1000).contains(&val));
    }

    #[test]
    fn test_resolve_random_int_range() {
        // Note: Our replacement expects no spaces in {{$randomInt N,M}}
        let result = resolve_dynamic_vars("num={{$randomInt 10,20}}");
        assert!(result.starts_with("num="));
        let val: i32 = result[4..].parse().unwrap();
        assert!((10..=20).contains(&val));
    }

    #[test]
    fn test_build_variable_map_priority() {
        let global = vec![
            KeyValue { key: "base".into(), value: "global_val".into(), enabled: true, is_secret: false },
            KeyValue { key: "shared".into(), value: "global".into(), enabled: true, is_secret: false },
        ];
        let collection = vec![
            KeyValue { key: "shared".into(), value: "collection".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("shared".into(), "env".into());
        env.insert("env_only".into(), "env_val".into());

        let map = build_variable_map(&global, &collection, &env, &[]);
        assert_eq!(map.get("base").unwrap(), "global_val");
        assert_eq!(map.get("shared").unwrap(), "env"); // env overrides collection and global
        assert_eq!(map.get("env_only").unwrap(), "env_val");
    }

    // ─── substitute_vars edge cases ─────────────────────────────────────────

    #[test]
    fn test_substitute_basic() {
        let mut vars = HashMap::new();
        vars.insert("host".into(), "api.example.com".into());
        vars.insert("port".into(), "8080".into());

        let result = substitute_vars("https://{{host}}:{{port}}/v1", &vars);
        assert_eq!(result, "https://api.example.com:8080/v1");
    }

    #[test]
    fn test_substitute_missing_var() {
        let vars = HashMap::new();
        let result = substitute_vars("hello={{missing}}", &vars);
        // Missing vars stay as-is
        assert_eq!(result, "hello={{missing}}");
    }

    #[test]
    fn test_substitute_overlapping_names() {
        let mut vars = HashMap::new();
        vars.insert("user".into(), "alice".into());
        vars.insert("username".into(), "alice_admin".into());

        let result = substitute_vars("{{user}} {{username}}", &vars);
        // {{user}} should match only "user", not "username"
        assert_eq!(result, "alice alice_admin");
    }

    #[test]
    fn test_substitute_empty_value() {
        let mut vars = HashMap::new();
        vars.insert("key".into(), "".into());

        let result = substitute_vars("value={{key}}", &vars);
        assert_eq!(result, "value=");
    }

    #[test]
    fn test_substitute_no_vars() {
        let mut vars = HashMap::new();
        vars.insert("key".into(), "val".into());

        let result = substitute_vars("plain text with no placeholders", &vars);
        assert_eq!(result, "plain text with no placeholders");
    }

    #[test]
    fn test_substitute_empty_input() {
        let mut vars = HashMap::new();
        vars.insert("key".into(), "val".into());

        let result = substitute_vars("", &vars);
        assert_eq!(result, "");
    }

    #[test]
    fn test_substitute_special_chars_in_value() {
        let mut vars = HashMap::new();
        vars.insert("url".into(), "https://example.com/api?key=val&q=1".into());
        vars.insert("json".into(), "{\"name\":\"test\"}".into());

        let result = substitute_vars("{{url}} body={{json}}", &vars);
        assert_eq!(result, "https://example.com/api?key=val&q=1 body={\"name\":\"test\"}");
    }

    // ─── build_variable_map edge cases ──────────────────────────────────────

    #[test]
    fn test_build_map_disabled_vars() {
        let global = vec![
            KeyValue { key: "enabled_key".into(), value: "val".into(), enabled: true, is_secret: false },
            KeyValue { key: "disabled_key".into(), value: "should_not_appear".into(), enabled: false, is_secret: false },
        ];

        let map = build_variable_map(&global, &[], &HashMap::new(), &[]);
        assert_eq!(map.get("enabled_key").unwrap(), "val");
        assert!(!map.contains_key("disabled_key"));
    }

    #[test]
    fn test_build_map_empty_keys() {
        let global = vec![
            KeyValue { key: "".into(), value: "empty_key".into(), enabled: true, is_secret: false },
            KeyValue { key: "valid".into(), value: "ok".into(), enabled: true, is_secret: false },
        ];

        let map = build_variable_map(&global, &[], &HashMap::new(), &[]);
        assert_eq!(map.get("valid").unwrap(), "ok");
        assert_eq!(map.len(), 1); // empty key should not be inserted
    }

    #[test]
    fn test_build_map_script_priority() {
        let mut env = HashMap::new();
        env.insert("shared".into(), "env_val".into());
        let script = vec![
            KeyValue { key: "shared".into(), value: "script_val".into(), enabled: true, is_secret: false },
        ];

        let map = build_variable_map(&[], &[], &env, &script);
        assert_eq!(map.get("shared").unwrap(), "script_val");
    }

    #[test]
    fn test_build_map_all_empty() {
        let map = build_variable_map(&[], &[], &HashMap::new(), &[]);
        assert!(map.is_empty());
    }

    // ─── resolve_dynamic_vars edge cases ────────────────────────────────────

    #[test]
    fn test_resolve_multiple_dynamic() {
        let result = resolve_dynamic_vars("ts={{$timestamp}} id={{$uuid}}");
        // Should have both placeholders replaced
        assert!(result.starts_with("ts="));
        assert!(result.contains(" id="));
        // UUID part is 36 chars
        let uuid_part = &result[result.find(" id=").unwrap() + 4..];
        assert_eq!(uuid_part.len(), 36);
    }

    #[test]
    fn test_resolve_no_dynamic_vars() {
        let result = resolve_dynamic_vars("just a regular string with no placeholders");
        assert_eq!(result, "just a regular string with no placeholders");
    }

    #[test]
    fn test_resolve_random_string_length() {
        let result = resolve_dynamic_vars("str={{$randomString 12}}");
        assert!(result.starts_with("str="));
        assert_eq!(result.len(), 4 + 12); // "str=" (4) + 12 chars
    }

    #[test]
    fn test_resolve_random_string_clamp_low() {
        // Length 0 should be clamped to 1
        let result = resolve_dynamic_vars("str={{$randomString 0}}");
        assert!(result.starts_with("str="));
        assert_eq!(result.len(), 4 + 1); // clamped to 1
    }

    #[test]
    fn test_resolve_random_string_clamp_high() {
        // Length 999 should be clamped to 256
        let result = resolve_dynamic_vars("str={{$randomString 999}}");
        assert!(result.starts_with("str="));
        assert_eq!(result.len(), 4 + 256); // clamped to 256
    }

    #[test]
    fn test_resolve_random_int_range_swapped() {
        // min > max should swap: {{$randomInt 100,0}} → range 0..=100
        let result = resolve_dynamic_vars("num={{$randomInt 100,0}}");
        assert!(result.starts_with("num="));
        let val: i32 = result[4..].parse().unwrap();
        assert!((0..=100).contains(&val));
    }

    #[test]
    fn test_resolve_random_email() {
        let result = resolve_dynamic_vars("email={{$randomEmail}}");
        assert!(result.starts_with("email="));
        assert!(result.ends_with("@example.com"));
        // 10-char random prefix + @example.com = 22 chars
        assert_eq!(result.len(), 6 + 10 + 12); // "email=" (6) + 10 random + "@example.com" (12)
    }

    #[test]
    fn test_resolve_guid() {
        let result = resolve_dynamic_vars("g={{$guid}}");
        assert!(result.starts_with("g="));
        assert_eq!(result.len(), 38); // "g=" (2) + 36 chars for GUID
    }

    #[test]
    fn test_resolve_timestamp_ms() {
        let result = resolve_dynamic_vars("t={{$timestamp ms}}");
        assert!(result.starts_with("t="));
        // Should be a numeric timestamp
        let val: i64 = result[2..].parse().unwrap();
        // Unix timestamp in ms for 2026 should be around 1.7-1.8 trillion
        assert!(val > 1_700_000_000_000);
    }

    // ─── apply_variables edge cases ─────────────────────────────────────────

    #[test]
    fn test_apply_variables_basic() {
        let request = make_request(
            "https://{{host}}/api/{{version}}/users",
            HttpMethod::GET,
            vec![],
            vec![],
            "",
        );

        let global = vec![
            KeyValue { key: "host".into(), value: "api.example.com".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("version".into(), "v2".into());

        let result = apply_variables(&request, &global, &[], &env, &[]);
        assert_eq!(result.url, "https://api.example.com/api/v2/users");
    }

    #[test]
    fn test_apply_variables_circular() {
        // A={{B}} and B={{A}} should not cause infinite loop.
        // Due to HashMap iteration order, the result may be either:
        //   A first: {{A}} → prefix_{{B}} → prefix_prefix_{{A}}
        //   B first: {{A}} stays, then → prefix_{{B}}
        // Both outcomes are valid — we just test no crash and no raw {{A}} remaining.
        let request = make_request("{{A}}", HttpMethod::GET, vec![], vec![], "");

        let global = vec![
            KeyValue { key: "A".into(), value: "prefix_{{B}}".into(), enabled: true, is_secret: false },
            KeyValue { key: "B".into(), value: "prefix_{{A}}".into(), enabled: true, is_secret: false },
        ];

        let result = apply_variables(&request, &global, &[], &HashMap::new(), &[]);
        // Both outcomes contain "prefix_" at least once
        assert!(result.url.contains("prefix_"));
        // The output should be exactly one of the two valid outcomes depending on HashMap iteration order
        assert!(
            result.url == "prefix_{{B}}" || result.url == "prefix_prefix_{{A}}",
            "Output '{}' was not one of the expected circular substitution results",
            result.url
        );
    }

    #[test]
    fn test_apply_variables_all_fields() {
        let request = make_request(
            "https://{{host}}/api",
            HttpMethod::POST,
            vec![
                KeyValue { key: "Authorization".into(), value: "Bearer {{token}}".into(), enabled: true, is_secret: false },
                KeyValue { key: "X-Request-Id".into(), value: "{{$uuid}}".into(), enabled: true, is_secret: false },
            ],
            vec![
                KeyValue { key: "page".into(), value: "{{page}}".into(), enabled: true, is_secret: false },
            ],
            "{\"user\": \"{{user}}\"}",
        );

        let global = vec![
            KeyValue { key: "host".into(), value: "api.test.com".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("token".into(), "sec-123".into());
        env.insert("page".into(), "1".into());
        env.insert("user".into(), "alice".into());

        let result = apply_variables(&request, &global, &[], &env, &[]);

        assert_eq!(result.url, "https://api.test.com/api");
        assert!(result.headers.iter().any(|h| h.key == "Authorization" && h.value == "Bearer sec-123"));
        assert!(result.headers.iter().any(|h| h.key == "X-Request-Id" && h.value.len() == 36));
        assert!(result.query_params.iter().any(|p| p.key == "page" && p.value == "1"));
        assert_eq!(result.body, "{\"user\": \"alice\"}");
    }

    #[test]
    fn test_apply_variables_empty_request() {
        let request = make_request("", HttpMethod::GET, vec![], vec![], "");
        let result = apply_variables(&request, &[], &[], &HashMap::new(), &[]);
        assert_eq!(result.url, "");
        assert_eq!(result.body, "");
        assert!(result.headers.is_empty());
        assert!(result.query_params.is_empty());
    }

    #[test]
    fn test_apply_variables_disabled_global_skipped() {
        let request = make_request("{{key}}", HttpMethod::GET, vec![], vec![], "");

        let global = vec![
            KeyValue { key: "key".into(), value: "should_not_appear".into(), enabled: false, is_secret: false },
        ];

        let result = apply_variables(&request, &global, &[], &HashMap::new(), &[]);
        // {{key}} should remain unresolved since the global var is disabled
        assert_eq!(result.url, "{{key}}");
    }

    #[test]
    fn test_apply_variables_script_overrides_env() {
        let request = make_request("{{secret}}", HttpMethod::GET, vec![], vec![], "");

        let mut env = HashMap::new();
        env.insert("secret".into(), "env_val".into());
        let script = vec![
            KeyValue { key: "secret".into(), value: "script_val".into(), enabled: true, is_secret: true },
        ];

        let result = apply_variables(&request, &[], &[], &env, &script);
        assert_eq!(result.url, "script_val");
    }

    #[test]
    fn test_apply_variables_mixed_dynamic_and_static() {
        let request = make_request(
            "https://{{host}}/log?ts={{$timestamp}}",
            HttpMethod::GET,
            vec![],
            vec![],
            "",
        );

        let global = vec![
            KeyValue { key: "host".into(), value: "logger.example.com".into(), enabled: true, is_secret: false },
        ];

        let result = apply_variables(&request, &global, &[], &HashMap::new(), &[]);
        // host should be resolved, timestamp should be a numeric value
        assert!(result.url.starts_with("https://logger.example.com/log?ts="));
        let ts_part = &result.url["https://logger.example.com/log?ts=".len()..];
        let ts_val: i64 = ts_part.parse().unwrap();
        assert!(ts_val > 1_700_000_000_000);
    }
}
