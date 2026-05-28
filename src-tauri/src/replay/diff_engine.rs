use serde_json::Value;
use super::models::*;

pub fn compute_full_diff(original: &crate::models::HttpResponse, replayed: &crate::models::HttpResponse) -> ReplayDiff {
    let body_diff = compute_body_diff(&original.body, &replayed.body);
    let headers_diff = compute_headers_diff(&original.headers, &replayed.headers);
    let timing_diff_ms = replayed.time_ms as i64 - original.time_ms as i64;
    let schema_drift = compute_schema_drift(&original.body, &replayed.body);

    ReplayDiff {
        body_diff,
        headers_diff,
        timing_diff_ms,
        schema_drift,
    }
}

pub fn compute_body_diff(original: &str, replayed: &str) -> BodyDiff {
    let orig_json: Result<Value, _> = serde_json::from_str(original);
    let repl_json: Result<Value, _> = serde_json::from_str(replayed);

    match (orig_json, repl_json) {
        (Ok(orig), Ok(repl)) => diff_json_values(&orig, &repl, ""),
        _ => diff_text_bodies(original, replayed),
    }
}

fn diff_json_values(a: &Value, b: &Value, path: &str) -> BodyDiff {
    let mut added_keys = Vec::new();
    let mut removed_keys = Vec::new();
    let mut modified_keys = Vec::new();

    traverse_json(a, b, path, &mut added_keys, &mut removed_keys, &mut modified_keys);

    BodyDiff {
        diff_type: "json".to_string(),
        added_keys,
        removed_keys,
        modified_keys,
        text_diff: None,
    }
}

fn traverse_json(
    a: &Value, b: &Value, path: &str,
    added: &mut Vec<String>, removed: &mut Vec<String>,
    modified: &mut Vec<ModifiedKey>,
) {
    if a.is_object() && b.is_object() {
        let a_map = a.as_object().unwrap();
        let b_map = b.as_object().unwrap();

        for (k, v) in b_map {
            let child_path = if path.is_empty() { k.clone() } else { format!("{}.{}", path, k) };
            if !a_map.contains_key(k) {
                added.push(child_path);
            } else {
                traverse_json(a_map.get(k).unwrap(), v, &child_path, added, removed, modified);
            }
        }

        for k in a_map.keys() {
            if !b_map.contains_key(k) {
                let child_path = if path.is_empty() { k.clone() } else { format!("{}.{}", path, k) };
                removed.push(child_path);
            }
        }
    } else if a.is_array() && b.is_array() {
        let a_arr = a.as_array().unwrap();
        let b_arr = b.as_array().unwrap();
        let max_len = a_arr.len().max(b_arr.len());
        for i in 0..max_len {
            let child_path = format!("{}[{}]", if path.is_empty() { "root" } else { path }, i);
            if i >= a_arr.len() {
                added.push(child_path);
            } else if i >= b_arr.len() {
                removed.push(child_path);
            } else {
                traverse_json(&a_arr[i], &b_arr[i], &child_path, added, removed, modified);
            }
        }
    } else if a != b {
        let key = if path.is_empty() { "root".to_string() } else { path.to_string() };
        modified.push(ModifiedKey {
            key,
            original: value_to_string(a),
            replayed: value_to_string(b),
        });
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        _ => v.to_string(),
    }
}

fn diff_text_bodies(original: &str, replayed: &str) -> BodyDiff {
    let lines_a: Vec<&str> = original.split('\n').collect();
    let lines_b: Vec<&str> = replayed.split('\n').collect();
    let mut text_diff = Vec::new();

    let max_lines = lines_a.len().max(lines_b.len());
    for i in 0..max_lines {
        let la = lines_a.get(i).copied();
        let lb = lines_b.get(i).copied();

        match (la, lb) {
            (Some(a), Some(b)) if a == b => {
                text_diff.push(TextDiffLine { line_type: "unchanged".to_string(), value: a.to_string() });
            }
            (Some(a), Some(b)) => {
                text_diff.push(TextDiffLine { line_type: "modified".to_string(), value: format!("Original: {} | Replayed: {}", a, b) });
            }
            (Some(a), None) => {
                text_diff.push(TextDiffLine { line_type: "removed".to_string(), value: a.to_string() });
            }
            (None, Some(b)) => {
                text_diff.push(TextDiffLine { line_type: "added".to_string(), value: b.to_string() });
            }
            _ => {}
        }
    }

    BodyDiff {
        diff_type: "text".to_string(),
        added_keys: vec![],
        removed_keys: vec![],
        modified_keys: vec![],
        text_diff: Some(text_diff),
    }
}

pub fn compute_headers_diff(
    original: &[(String, String)],
    replayed: &[(String, String)],
) -> HeadersDiff {
    use std::collections::HashMap;
    let mut map_a: HashMap<String, (String, String)> = HashMap::new();
    let mut map_b: HashMap<String, (String, String)> = HashMap::new();

    for (k, v) in original {
        map_a.insert(k.to_lowercase(), (k.clone(), v.clone()));
    }
    for (k, v) in replayed {
        map_b.insert(k.to_lowercase(), (k.clone(), v.clone()));
    }

    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut modified = Vec::new();

    for (lk, (ok, ov)) in &map_b {
        match map_a.get(lk) {
            None => added.push((ok.clone(), ov.clone())),
            Some((_, av)) if av != ov => modified.push(ModifiedHeader { name: ok.clone(), original: av.clone(), replayed: ov.clone() }),
            _ => {}
        }
    }

    for (lk, (ok, ov)) in &map_a {
        if !map_b.contains_key(lk) {
            removed.push((ok.clone(), ov.clone()));
        }
    }

    HeadersDiff { added, removed, modified }
}

pub fn compute_schema_drift(original: &str, replayed: &str) -> Vec<String> {
    let orig_json: Result<Value, _> = serde_json::from_str(original);
    let repl_json: Result<Value, _> = serde_json::from_str(replayed);

    match (orig_json, repl_json) {
        (Ok(orig), Ok(repl)) => {
            let mut drift = Vec::new();
            detect_drift(&orig, &repl, "", &mut drift);
            drift
        }
        _ => vec![],
    }
}

fn detect_drift(a: &Value, b: &Value, path: &str, drift: &mut Vec<String>) {
    if a.is_null() || b.is_null() {
        return;
    }

    let type_a = json_type_name(a);
    let type_b = json_type_name(b);

    if type_a != type_b {
        let display = if path.is_empty() { "root" } else { path };
        drift.push(format!("Type mismatch at {}: expected {}, got {}", display, type_a, type_b));
        return;
    }

    if let (Some(a_obj), Some(b_obj)) = (a.as_object(), b.as_object()) {
        for k in a_obj.keys() {
            if let Some(bv) = b_obj.get(k) {
                let child_path = if path.is_empty() { k.clone() } else { format!("{}.{}", path, k) };
                detect_drift(a_obj.get(k).unwrap(), bv, &child_path, drift);
            }
        }
    }
}

fn json_type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(n) => if n.is_f64() { "number" } else { "integer" },
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

pub fn evaluate_assertion(
    assertion: &ReplayAssertion,
    response: &crate::models::HttpResponse,
) -> AssertionResult {
    let mut result = AssertionResult {
        id: assertion.id.clone(),
        assertion_type: assertion.assertion_type.clone(),
        expression: assertion.expression.clone(),
        expected: assertion.expected.clone(),
        passed: false,
        actual: None,
        enabled: assertion.enabled,
    };

    if !assertion.enabled {
        result.passed = true;
        return result;
    }

    match assertion.assertion_type {
        AssertionType::StatusCode => {
            if let Ok(expected_code) = assertion.expected.parse::<u16>() {
                result.actual = Some(response.status.to_string());
                result.passed = response.status == expected_code;
            }
        }
        AssertionType::ResponseTime => {
            let condition = assertion.expected.trim();
            result.actual = Some(format!("{}ms", response.time_ms));
            if let Some(rest) = condition.strip_prefix('<') {
                if let Ok(val) = rest.trim().parse::<u64>() {
                    result.passed = response.time_ms < val;
                }
            } else if let Some(rest) = condition.strip_prefix('>') {
                if let Ok(val) = rest.trim().parse::<u64>() {
                    result.passed = response.time_ms > val;
                }
            } else if let Ok(val) = condition.parse::<u64>() {
                result.passed = response.time_ms <= val;
            }
        }
        AssertionType::BodyContains => {
            let look_for = &assertion.expected;
            result.actual = Some(if response.body.len() > 50 { format!("{}...", &response.body[..50.min(response.body.len())]) } else { response.body.clone() });
            result.passed = response.body.contains(look_for);
        }
        AssertionType::JsonPath => {
            if let Ok(parsed) = serde_json::from_str::<Value>(&response.body) {
                let parts: Vec<&str> = assertion.expression.trim_start_matches("$.").split('.').filter(|s| !s.is_empty()).collect();
                let mut current = &parsed;
                for p in &parts {
                    if let Some(v) = current.get(p) {
                        current = v;
                    } else {
                        current = &Value::Null;
                        break;
                    }
                }
                result.actual = Some(if current.is_null() { "undefined".to_string() } else { value_to_string(current) });
                result.passed = value_to_string(current) == assertion.expected;
            }
        }
    }

    result
}
