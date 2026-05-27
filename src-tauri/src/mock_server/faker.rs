use rand::Rng;
use regex::Regex;
use std::collections::HashMap;
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct RequestContext {
    pub path: String,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub body: String,
    pub variables: HashMap<String, String>,
}

const NAMES: &[&str] = &[
    "Ahmet Yilmaz", "Ayse Kaya", "Mehmet Demir", "Fatma Sahin", "Mustafa Celik",
    "John Doe", "Jane Smith", "Alice Johnson", "Bob Brown", "Charlie Green",
    "Emre Can", "Elif Yildiz", "Canan Ozdemir", "Burak Yilmaz", "Zeynep Aslan"
];

const DOMAINS: &[&str] = &["example.com", "test.com", "gmail.com", "sireq.io"];

pub fn render(template: &str, ctx: &RequestContext) -> (String, Vec<String>) {
    let mut rendered = template.to_string();
    let mut warnings = Vec::new();

    // Regex to match {{ ... }}
    let re = match Regex::new(r"\{\{\s*([^{}]+?)\s*\}\}") {
        Ok(r) => r,
        Err(e) => {
            warnings.push(format!("Regex creation failed: {}", e));
            return (rendered, warnings);
        }
    };

    // We do a pass to replace placeholders.
    // To prevent infinite loops or issues with overlapping replacements,
    // we find matches and replace them.
    let mut has_changes = true;
    let mut iterations = 0;
    
    // Cap iterations to avoid recursion or infinite loops
    while has_changes && iterations < 5 {
        has_changes = false;
        iterations += 1;
        
        let mut next_rendered = rendered.clone();
        let matches: Vec<_> = re.captures_iter(&rendered).collect();
        
        if matches.is_empty() {
            break;
        }

        // We replace matches from back to front to keep indices valid
        for cap in matches.into_iter().rev() {
            let full_match = cap.get(0).unwrap();
            let expr = cap.get(1).unwrap().as_str().trim();
            
            let (replaced_val, warn) = resolve_expression(expr, ctx);
            if let Some(w) = warn {
                if !warnings.contains(&w) {
                    warnings.push(w);
                }
            }
            
            next_rendered.replace_range(full_match.start()..full_match.end(), &replaced_val);
            has_changes = true;
        }
        
        rendered = next_rendered;
    }

    (rendered, warnings)
}

fn resolve_expression(expr: &str, ctx: &RequestContext) -> (String, Option<String>) {
    // 1. Faker Engine
    if let Some(faker_expr) = expr.strip_prefix("faker.") {
        
        if faker_expr == "uuid" {
            return (Uuid::new_v4().to_string(), None);
        }
        
        if faker_expr == "name" {
            let idx = rand::thread_rng().gen_range(0..NAMES.len());
            return (NAMES[idx].to_string(), None);
        }
        
        if faker_expr == "email" {
            let idx_name = rand::thread_rng().gen_range(0..NAMES.len());
            let idx_domain = rand::thread_rng().gen_range(0..DOMAINS.len());
            let name_slug = NAMES[idx_name].to_lowercase().replace(" ", ".");
            return (format!("{}@{}", name_slug, DOMAINS[idx_domain]), None);
        }
        
        if faker_expr == "date" {
            return (Utc::now().to_rfc3339(), None);
        }
        
        // faker.integer(min, max)
        if faker_expr.starts_with("integer(") && faker_expr.ends_with(')') {
            let args = &faker_expr[8..faker_expr.len() - 1];
            let parts: Vec<&str> = args.split(',').map(|s| s.trim()).collect();
            if parts.len() == 2 {
                let min_res = parts[0].parse::<i64>();
                let max_res = parts[1].parse::<i64>();
                match (min_res, max_res) {
                    (Ok(min), Ok(max)) => {
                        let val = if min >= max {
                            min
                        } else {
                            rand::thread_rng().gen_range(min..=max)
                        };
                        return (val.to_string(), None);
                    }
                    _ => return ("".to_string(), Some(format!("Invalid integer range arguments: {}", args))),
                }
            }
            return ("".to_string(), Some(format!("Invalid faker integer expression: {}", expr)));
        }

        // faker.number(min, max)
        if faker_expr.starts_with("number(") && faker_expr.ends_with(')') {
            let args = &faker_expr[7..faker_expr.len() - 1];
            let parts: Vec<&str> = args.split(',').map(|s| s.trim()).collect();
            if parts.len() == 2 {
                let min_res = parts[0].parse::<f64>();
                let max_res = parts[1].parse::<f64>();
                match (min_res, max_res) {
                    (Ok(min), Ok(max)) => {
                        let val = if min >= max {
                            min
                        } else {
                            rand::thread_rng().gen_range(min..=max)
                        };
                        return (format!("{:.4}", val), None);
                    }
                    _ => return ("".to_string(), Some(format!("Invalid number range arguments: {}", args))),
                }
            }
            return ("".to_string(), Some(format!("Invalid faker number expression: {}", expr)));
        }

        return ("".to_string(), Some(format!("Unknown faker method: {}", expr)));
    }

    // 2. Request Data
    if let Some(req_expr) = expr.strip_prefix("request.") {
        
        if req_expr == "path" {
            return (ctx.path.clone(), None);
        }
        
        if let Some(query_key) = req_expr.strip_prefix("query.") {
            if let Some(val) = ctx.query_params.get(query_key) {
                return (val.clone(), None);
            }
            return ("".to_string(), Some(format!("Query parameter not found: {}", query_key)));
        }
        
        if let Some(header_key) = req_expr.strip_prefix("headers.") {
            let lower_key = header_key.to_lowercase();
            // Look up case-insensitively
            for (k, v) in &ctx.headers {
                if k.to_lowercase() == lower_key {
                    return (v.clone(), None);
                }
            }
            return ("".to_string(), Some(format!("Request header not found: {}", header_key)));
        }
        
        if let Some(jsonpath_exp) = req_expr.strip_prefix("body.") {
            // Prepend '$' if not present
            let parsed_path = if jsonpath_exp.starts_with('$') {
                jsonpath_exp.to_string()
            } else {
                format!("$.{}", jsonpath_exp)
            };
            
            match evaluate_jsonpath(&ctx.body, &parsed_path) {
                Some(val) => return (val, None),
                None => return ("".to_string(), Some(format!("JSONPath query returned no results: {}", jsonpath_exp))),
            }
        }
        
        return ("".to_string(), Some(format!("Unknown request property: {}", expr)));
    }

    // 3. Variables / Environment / Globals
    if let Some(val) = ctx.variables.get(expr) {
        return (val.clone(), None);
    }

    // If not found anywhere, keep empty string and log warning
    ("".to_string(), Some(format!("Variable or expression could not be resolved: {}", expr)))
}

fn evaluate_jsonpath(body: &str, expression: &str) -> Option<String> {
    let finder = jsonpath_rust::JsonPathFinder::from_str(body, expression).ok()?;
    let val = finder.find();
    if val.is_null() {
        return None;
    }
    if let serde_json::Value::Array(ref arr) = val {
        if arr.is_empty() {
            return None;
        }
        if arr.len() == 1 {
            let item = &arr[0];
            return Some(match item {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            });
        }
    }
    Some(match val {
        serde_json::Value::String(s) => s,
        other => other.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> RequestContext {
        let mut headers = HashMap::new();
        headers.insert("content-type".into(), "application/json".into());
        headers.insert("authorization".into(), "Bearer test-token".into());
        let mut query_params = HashMap::new();
        query_params.insert("page".into(), "2".into());
        query_params.insert("limit".into(), "50".into());
        let mut variables = HashMap::new();
        variables.insert("my_var".into(), "my_value".into());
        RequestContext {
            path: "/api/users/42".into(),
            headers,
            query_params,
            body: r#"{"name": "Alice", "age": 30}"#.into(),
            variables,
        }
    }

    #[test]
    fn test_render_no_placeholders() {
        let (result, warnings) = render("hello world", &ctx());
        assert_eq!(result, "hello world");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_uuid() {
        let (result, warnings) = render("{{faker.uuid}}", &ctx());
        assert_eq!(result.len(), 36); // UUID v4 format
        assert_eq!(result.chars().filter(|&c| c == '-').count(), 4);
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_name() {
        let (result, warnings) = render("{{faker.name}}", &ctx());
        assert!(!result.is_empty());
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_email() {
        let (result, warnings) = render("{{faker.email}}", &ctx());
        assert!(result.contains('@'));
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_date() {
        let (result, warnings) = render("{{faker.date}}", &ctx());
        assert!(!result.is_empty());
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_integer() {
        let (result, warnings) = render("{{faker.integer(10, 20)}}", &ctx());
        let val: i64 = result.parse().unwrap();
        assert!((10..=20).contains(&val));
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_integer_reversed_range() {
        // min >= max should return min
        let (result, warnings) = render("{{faker.integer(99, 1)}}", &ctx());
        assert_eq!(result, "99");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_faker_number() {
        let (result, warnings) = render("{{faker.number(1.0, 10.0)}}", &ctx());
        let val: f64 = result.parse().unwrap();
        assert!((1.0..=10.0).contains(&val), "got {}", val);
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_request_path() {
        let (result, warnings) = render("{{request.path}}", &ctx());
        assert_eq!(result, "/api/users/42");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_request_query() {
        let (result, warnings) = render("{{request.query.page}}", &ctx());
        assert_eq!(result, "2");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_request_header() {
        let (result, warnings) = render("{{request.headers.authorization}}", &ctx());
        assert_eq!(result, "Bearer test-token");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_request_header_case_insensitive() {
        let (result, warnings) = render("{{request.headers.Authorization}}", &ctx());
        assert_eq!(result, "Bearer test-token");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_request_body_jsonpath() {
        let (result, warnings) = render("{{request.body.name}}", &ctx());
        assert_eq!(result, "Alice");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_variable() {
        let (result, warnings) = render("{{my_var}}", &ctx());
        assert_eq!(result, "my_value");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_unknown_expression_gives_warning() {
        let (result, warnings) = render("{{nonexistent}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
        assert!(warnings[0].contains("nonexistent"));
    }

    #[test]
    fn test_render_multiple_placeholders() {
        let template = "User: {{faker.name}}, Email: {{faker.email}}, Path: {{request.path}}";
        let (result, warnings) = render(template, &ctx());
        assert!(result.contains("User: "));
        assert!(result.contains(", Email: "));
        assert!(result.contains(", Path: /api/users/42"));
        // Name and email should NOT be empty
        let parts: Vec<&str> = result.split(", ").collect();
        assert_eq!(parts.len(), 3);
        assert!(parts[0].len() > 6);  // "User: " + at least one char
        assert!(parts[1].len() > 8);  // "Email: " + at least one char
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_render_unknown_faker_method() {
        let (result, warnings) = render("{{faker.unknown}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
        assert!(warnings[0].contains("Unknown faker method"));
    }

    #[test]
    fn test_render_faker_integer_bad_args() {
        let (result, warnings) = render("{{faker.integer(abc)}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
    }

    #[test]
    fn test_render_request_missing_header() {
        let (result, warnings) = render("{{request.headers.x-missing}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
        assert!(warnings[0].contains("header not found"));
    }

    #[test]
    fn test_render_request_missing_query() {
        let (result, warnings) = render("{{request.query.nonexistent}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
    }

    #[test]
    fn test_render_request_missing_body_path() {
        let (result, warnings) = render("{{request.body.missing}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
        assert!(warnings[0].contains("no results"));
    }

    #[test]
    fn test_render_unknown_request_property() {
        let (result, warnings) = render("{{request.unknown}}", &ctx());
        assert_eq!(result, "");
        assert!(!warnings.is_empty());
        assert!(warnings[0].contains("Unknown request property"));
    }

    #[test]
    fn test_render_iteration_limit_prevented_infinite_loop() {
        // A template that keeps getting replaced should eventually stop
        let template = "{{faker.uuid}}";
        let (result, _) = render(template, &ctx());
        // Should produce a UUID-like string
        assert_eq!(result.len(), 36);
    }
}
