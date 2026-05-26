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
    if expr.starts_with("faker.") {
        let faker_expr = &expr[6..];
        
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
    if expr.starts_with("request.") {
        let req_expr = &expr[8..];
        
        if req_expr == "path" {
            return (ctx.path.clone(), None);
        }
        
        if req_expr.starts_with("query.") {
            let query_key = &req_expr[6..];
            if let Some(val) = ctx.query_params.get(query_key) {
                return (val.clone(), None);
            }
            return ("".to_string(), Some(format!("Query parameter not found: {}", query_key)));
        }
        
        if req_expr.starts_with("headers.") {
            let header_key = &req_expr[8..];
            let lower_key = header_key.to_lowercase();
            // Look up case-insensitively
            for (k, v) in &ctx.headers {
                if k.to_lowercase() == lower_key {
                    return (v.clone(), None);
                }
            }
            return ("".to_string(), Some(format!("Request header not found: {}", header_key)));
        }
        
        if req_expr.starts_with("body.") {
            let jsonpath_exp = &req_expr[5..];
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
