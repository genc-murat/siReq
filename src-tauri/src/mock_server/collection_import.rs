use crate::models::{Collection, flatten_collection_items};
use crate::mock_server::models::{MockServerConfig, CorsConfig, MockEndpoint, ResponseScenario, RequestMatcher};
use std::collections::HashMap;
use uuid::Uuid;

pub fn collection_to_mock_config(collection: &Collection, name: &str, port: u16) -> MockServerConfig {
    let mut endpoints = Vec::new();
    let flattened_reqs = flatten_collection_items(&collection.items);

    for req in flattened_reqs {
        let path = extract_path(&req.url);
        let method = method_to_str(&req.method);
        
        let mut scenarios = Vec::new();
        
        // 1. Process examples/saved variants of the request
        for example in &req.examples {
            let mut status_code = 200;
            let mut response_headers = HashMap::new();
            let mut response_body = String::new();
            
            if let Some(resp) = &example.response {
                status_code = resp.status;
                response_headers = map_resp_headers(&resp.headers);
                response_body = resp.body.clone();
            }
            
            // Build simple rules based on example request properties if possible
            let mut rules = Vec::new();
            
            // Example: Match if query params in example match
            for q in &example.request.query_params {
                if q.enabled && !q.key.is_empty() {
                    rules.push(RequestMatcher {
                        source: "query".to_string(),
                        key: q.key.clone(),
                        operator: "equals".to_string(),
                        value: q.value.clone(),
                    });
                }
            }
            
            // Example: Match if header in example matches
            for h in &example.request.headers {
                if h.enabled && !h.key.is_empty() && h.key.to_lowercase() != "user-agent" {
                    rules.push(RequestMatcher {
                        source: "header".to_string(),
                        key: h.key.clone(),
                        operator: "equals".to_string(),
                        value: h.value.clone(),
                    });
                }
            }

            scenarios.push(ResponseScenario {
                id: example.id.clone(),
                name: example.name.clone(),
                is_default: false,
                status_code,
                headers: response_headers,
                body: response_body,
                latency: None,
                rules,
            });
        }
        
        // 2. Create the default response scenario based on the main request
        let mut default_headers = HashMap::new();
        default_headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        scenarios.insert(0, ResponseScenario {
            id: Uuid::new_v4().to_string(),
            name: "Default Response".to_string(),
            is_default: true,
            status_code: 200,
            headers: default_headers,
            body: "{\"status\": \"ok\"}".to_string(),
            latency: None,
            rules: Vec::new(),
        });

        // Set is_default correctly: first is default, others are false
        for (i, scenario) in scenarios.iter_mut().enumerate() {
            scenario.is_default = i == 0;
        }

        endpoints.push(MockEndpoint {
            id: Uuid::new_v4().to_string(),
            path,
            method,
            scenarios,
        });
    }

    MockServerConfig {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        port,
        endpoints,
        cors_enabled: false, // Default is disabled
        cors_config: CorsConfig::default(),
        headers: HashMap::new(),
    }
}

fn extract_path(url: &str) -> String {
    let mut cleaned = url.trim().to_string();
    
    // Remove protocol if present
    if cleaned.starts_with("http://") {
        cleaned = cleaned[7..].to_string();
    } else if cleaned.starts_with("https://") {
        cleaned = cleaned[8..].to_string();
    }
    
    // Remove domain/host. If starts with a variable like {{baseUrl}}, strip it.
    if cleaned.starts_with("{{") {
        if let Some(close_idx) = cleaned.find("}}") {
            cleaned = cleaned[close_idx + 2..].to_string();
        }
    } else if let Some(slash_idx) = cleaned.find('/') {
        cleaned = cleaned[slash_idx..].to_string();
    }
    
    // Remove query parameters
    if let Some(q_idx) = cleaned.find('?') {
        cleaned = cleaned[..q_idx].to_string();
    }
    
    // Ensure leading slash
    if !cleaned.starts_with('/') {
        cleaned = format!("/{}", cleaned);
    }
    
    cleaned
}

fn method_to_str(m: &crate::models::HttpMethod) -> String {
    match m {
        crate::models::HttpMethod::GET => "GET",
        crate::models::HttpMethod::POST => "POST",
        crate::models::HttpMethod::PUT => "PUT",
        crate::models::HttpMethod::PATCH => "PATCH",
        crate::models::HttpMethod::DELETE => "DELETE",
        crate::models::HttpMethod::HEAD => "HEAD",
        crate::models::HttpMethod::OPTIONS => "OPTIONS",
        crate::models::HttpMethod::TRACE => "TRACE",
    }.to_string()
}

fn map_resp_headers(headers: &[(String, String)]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for (k, v) in headers {
        if !k.is_empty() {
            map.insert(k.clone(), v.clone());
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    // ─── extract_path ────────────────────────────────────────────

    #[test]
    fn test_extract_path_full_url() {
        assert_eq!(extract_path("https://example.com/api/users"), "/api/users");
    }

    #[test]
    fn test_extract_path_http_url() {
        assert_eq!(extract_path("http://localhost:3000/items"), "/items");
    }

    #[test]
    fn test_extract_path_variable_prefix() {
        assert_eq!(extract_path("{{baseUrl}}/api/data"), "/api/data");
    }

    #[test]
    fn test_extract_path_variable_prefix_no_slash() {
        assert_eq!(extract_path("{{host}}api/data"), "/api/data");
    }

    #[test]
    fn test_extract_path_with_query_string() {
        assert_eq!(extract_path("https://example.com/search?q=test&page=1"), "/search");
    }

    #[test]
    fn test_extract_path_without_leading_slash() {
        assert_eq!(extract_path("users"), "/users");
    }

    #[test]
    fn test_extract_path_already_has_leading_slash() {
        assert_eq!(extract_path("/users"), "/users");
    }

    #[test]
    fn test_extract_path_root_returns_domain_as_path() {
        // When the URL has no path, the domain becomes the path
        assert_eq!(extract_path("https://example.com"), "/example.com");
    }

    #[test]
    fn test_extract_path_empty() {
        assert_eq!(extract_path(""), "/");
    }

    // ─── method_to_str ───────────────────────────────────────────

    #[test]
    fn test_method_to_str_all_variants() {
        assert_eq!(method_to_str(&HttpMethod::GET), "GET");
        assert_eq!(method_to_str(&HttpMethod::POST), "POST");
        assert_eq!(method_to_str(&HttpMethod::PUT), "PUT");
        assert_eq!(method_to_str(&HttpMethod::PATCH), "PATCH");
        assert_eq!(method_to_str(&HttpMethod::DELETE), "DELETE");
        assert_eq!(method_to_str(&HttpMethod::HEAD), "HEAD");
        assert_eq!(method_to_str(&HttpMethod::OPTIONS), "OPTIONS");
        assert_eq!(method_to_str(&HttpMethod::TRACE), "TRACE");
    }

    // ─── map_resp_headers ────────────────────────────────────────

    #[test]
    fn test_map_resp_headers_empty() {
        let result = map_resp_headers(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_map_resp_headers_with_values() {
        let input = vec![
            ("Content-Type".into(), "application/json".into()),
            ("X-Custom".into(), "value".into()),
        ];
        let result = map_resp_headers(&input);
        assert_eq!(result.len(), 2);
        assert_eq!(result.get("Content-Type").unwrap(), "application/json");
        assert_eq!(result.get("X-Custom").unwrap(), "value");
    }

    #[test]
    fn test_map_resp_headers_skips_empty_key() {
        let input = vec![
            ("".into(), "val".into()),
            ("Valid".into(), "ok".into()),
        ];
        let result = map_resp_headers(&input);
        assert_eq!(result.len(), 1);
        assert_eq!(result.get("Valid").unwrap(), "ok");
    }

    // ─── collection_to_mock_config ───────────────────────────────

    #[test]
    fn test_collection_to_mock_config_basic_structure() {
        let req = HttpRequest {
            id: "req-1".into(),
            name: "Get Users".into(),
            method: HttpMethod::GET,
            url: "https://api.example.com/users".into(),
            headers: vec![],
            query_params: vec![],
            body_type: BodyType::none,
            body: String::new(),
            form_fields: vec![],
            auth: AuthConfig {
                auth_type: AuthType::none,
                username: String::new(), password: String::new(),
                token: String::new(), api_key: String::new(),
                api_key_name: String::new(), api_key_in: "header".into(),
            },
            settings: RequestSettings {
                timeout: 30, follow_redirects: true, ssl_verify: true, proxy: None,
            },
            pre_script: String::new(),
            post_script: String::new(),
            examples: vec![],
            extractions: vec![],
        };

        let collection = Collection {
            id: "col-1".into(),
            name: "Test Collection".into(),
            items: vec![CollectionItem::Request(req)],
            created_at: "".into(),
            updated_at: "".into(),
            variables: vec![],
            auth: None,
            description: String::new(),
        };

        let config = collection_to_mock_config(&collection, "Mock API", 8080);
        assert_eq!(config.name, "Mock API");
        assert_eq!(config.port, 8080);
        assert_eq!(config.endpoints.len(), 1);
        assert_eq!(config.endpoints[0].path, "/users");
        assert_eq!(config.endpoints[0].method, "GET");
    }

    #[test]
    fn test_collection_to_mock_config_with_example() {
        let req = HttpRequest {
            id: "req-1".into(),
            name: "Create User".into(),
            method: HttpMethod::POST,
            url: "https://api.example.com/users".into(),
            headers: vec![],
            query_params: vec![],
            body_type: BodyType::json,
            body: r#"{"name": "Test"}"#.into(),
            form_fields: vec![],
            auth: AuthConfig {
                auth_type: AuthType::none,
                username: String::new(), password: String::new(),
                token: String::new(), api_key: String::new(),
                api_key_name: String::new(), api_key_in: "header".into(),
            },
            settings: RequestSettings {
                timeout: 30, follow_redirects: true, ssl_verify: true, proxy: None,
            },
            pre_script: String::new(),
            post_script: String::new(),
            examples: vec![RequestExample {
                id: "ex-1".into(),
                name: "201 Created".into(),
                request: HttpRequest {
                    id: "req-ex".into(),
                    name: String::new(),
                    method: HttpMethod::POST,
                    url: "https://api.example.com/users".into(),
                    headers: vec![KeyValue { key: "X-Debug".into(), value: "true".into(), enabled: true, is_secret: false }],
                    query_params: vec![],
                    body_type: BodyType::json,
                    body: String::new(),
                    form_fields: vec![],
                    auth: AuthConfig { auth_type: AuthType::none, username: String::new(), password: String::new(), token: String::new(), api_key: String::new(), api_key_name: String::new(), api_key_in: "header".into() },
                    settings: RequestSettings { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: None },
                    pre_script: String::new(),
                    post_script: String::new(),
                    examples: vec![],
                    extractions: vec![],
                },
                response: Some(HttpResponse {
                    status: 201,
                    status_text: "Created".into(),
                    headers: vec![("Location".into(), "/users/123".into())],
                    cookies: vec![],
                    body: r#"{"id": 123}"#.into(),
                    body_base64: None,
                    size: 10,
                    time_ms: 50,
                    script_logs: vec![],
                    test_results: vec![],
                    modified_variables: vec![],
                }),
                created_at: "".into(),
            }],
            extractions: vec![],
        };

        let collection = Collection {
            id: "col-1".into(),
            name: "Test".into(),
            items: vec![CollectionItem::Request(req)],
            created_at: "".into(),
            updated_at: "".into(),
            variables: vec![],
            auth: None,
            description: String::new(),
        };

        let config = collection_to_mock_config(&collection, "Mock", 8080);
        assert_eq!(config.endpoints.len(), 1);
        assert_eq!(config.endpoints[0].scenarios.len(), 2); // default + example
        assert!(config.endpoints[0].scenarios[0].is_default);
        assert_eq!(config.endpoints[0].scenarios[1].name, "201 Created");
        assert_eq!(config.endpoints[0].scenarios[1].status_code, 201);
    }

    #[test]
    fn test_collection_to_mock_config_empty_collection() {
        let collection = Collection {
            id: "empty".into(),
            name: "Empty".into(),
            items: vec![],
            created_at: "".into(),
            updated_at: "".into(),
            variables: vec![],
            auth: None,
            description: String::new(),
        };
        let config = collection_to_mock_config(&collection, "Empty", 9000);
        assert_eq!(config.name, "Empty");
        assert_eq!(config.port, 9000);
        assert!(config.endpoints.is_empty());
    }

    #[test]
    fn test_collection_to_mock_config_nested_folder() {
        let req = HttpRequest {
            id: "nested-req".into(),
            name: "Nested".into(),
            method: HttpMethod::GET,
            url: "https://api.example.com/nested".into(),
            headers: vec![],
            query_params: vec![],
            body_type: BodyType::none,
            body: String::new(),
            form_fields: vec![],
            auth: AuthConfig { auth_type: AuthType::none, username: String::new(), password: String::new(), token: String::new(), api_key: String::new(), api_key_name: String::new(), api_key_in: "header".into() },
            settings: RequestSettings { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: None },
            pre_script: String::new(),
            post_script: String::new(),
            examples: vec![],
            extractions: vec![],
        };

        let folder = CollectionItem::Folder(CollectionFolder {
            id: "folder-1".into(),
            name: "Users".into(),
            description: String::new(),
            items: vec![CollectionItem::Request(req)],
            auth: None,
            created_at: "".into(),
            updated_at: "".into(),
        });

        let collection = Collection {
            id: "col".into(),
            name: "Nested".into(),
            items: vec![folder],
            created_at: "".into(),
            updated_at: "".into(),
            variables: vec![],
            auth: None,
            description: String::new(),
        };

        let config = collection_to_mock_config(&collection, "Nested", 8080);
        assert_eq!(config.endpoints.len(), 1);
        assert_eq!(config.endpoints[0].path, "/nested");
    }
}
