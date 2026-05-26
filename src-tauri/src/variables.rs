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

    loop {
        let start = match result.find(pattern_start) {
            Some(pos) => pos,
            None => break,
        };

        let after_start = &result[start + pattern_start.len()..];
        let end = match after_start.find(pattern_end) {
            Some(pos) => pos,
            None => break,
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

    loop {
        let start = match result.find(pattern_start) {
            Some(pos) => pos,
            None => break,
        };

        let after_start = &result[start + pattern_start.len()..];
        let end = match after_start.find(pattern_end) {
            Some(pos) => pos,
            None => break,
        };

        let len_str = &after_start[..end].trim();
        let length = len_str.parse::<usize>().unwrap_or(8).max(1).min(256);
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
        assert!(val >= 0 && val <= 1000);
    }

    #[test]
    fn test_resolve_random_int_range() {
        // Note: Our replacement expects no spaces in {{$randomInt N,M}}
        let result = resolve_dynamic_vars("num={{$randomInt 10,20}}");
        assert!(result.starts_with("num="));
        let val: i32 = result[4..].parse().unwrap();
        assert!(val >= 10 && val <= 20);
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
}
