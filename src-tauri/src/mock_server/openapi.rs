use crate::mock_server::models::{MockServerConfig, CorsConfig, MockEndpoint, ResponseScenario};
use crate::openapi_parser::generate_example_body_with_spec;
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

pub fn openapi_to_mock_config(spec_content: &str, name: &str, port: u16) -> Result<MockServerConfig, String> {
    // Try JSON first, then YAML
    let spec: Value = serde_json::from_str(spec_content)
        .or_else(|_| serde_yaml::from_str(spec_content))
        .map_err(|e| format!("Failed to parse spec: {}. Must be valid JSON or YAML.", e))?;

    let paths = spec.get("paths")
        .and_then(|p| p.as_object())
        .ok_or_else(|| "Spec has no 'paths' field".to_string())?;
        
    let mut endpoints = Vec::new();

    for (path, path_item) in paths {
        let methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
        for method in &methods {
            if let Some(operation) = path_item.get(*method) {
                let mut scenarios = Vec::new();
                
                // Parse responses
                if let Some(responses) = operation.get("responses").and_then(|r| r.as_object()) {
                    for (status_str, response_val) in responses {
                        // Parse status code (e.g. "200", "default")
                        let status_code: u16 = status_str.parse::<u16>().unwrap_or(200);
                        if !(100..=599).contains(&status_code) && status_str != "default" {
                            continue; // skip invalid status codes
                        }
                        
                        let scenario_name = response_val.get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or(status_str);

                        // Try to find schema
                        let mut schema_opt = None;
                        if let Some(content) = response_val.get("content").and_then(|c| c.as_object()) {
                            // Try application/json first
                            if let Some(json_content) = content.get("application/json") {
                                schema_opt = json_content.get("schema").cloned();
                            } else if let Some(first_content) = content.values().next() {
                                schema_opt = first_content.get("schema").cloned();
                            }
                        } else if let Some(schema) = response_val.get("schema") {
                            // Swagger v2 fallback
                            schema_opt = Some(schema.clone());
                        }

                        let mut body = String::new();
                        let mut headers = HashMap::new();
                        if let Some(schema) = schema_opt {
                            body = generate_example_body_with_spec(&schema, &spec);
                            headers.insert("Content-Type".to_string(), "application/json".to_string());
                        }

                        scenarios.push(ResponseScenario {
                            id: Uuid::new_v4().to_string(),
                            name: scenario_name.to_string(),
                            is_default: false,
                            status_code,
                            headers,
                            body,
                            latency: None,
                            rules: Vec::new(),
                        });
                    }
                }

                // If no scenarios are found, create a default 200 scenario
                if scenarios.is_empty() {
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    scenarios.push(ResponseScenario {
                        id: Uuid::new_v4().to_string(),
                        name: "Default Success".to_string(),
                        is_default: true,
                        status_code: 200,
                        headers,
                        body: "{\"status\": \"success\"}".to_string(),
                        latency: None,
                        rules: Vec::new(),
                    });
                } else {
                    // Sort scenarios to make sure default or 2xx is first
                    scenarios.sort_by_key(|s| {
                        if (200..300).contains(&s.status_code) {
                            0
                        } else {
                            1
                        }
                    });
                    // Mark the first one as default
                    for (i, s) in scenarios.iter_mut().enumerate() {
                        s.is_default = i == 0;
                    }
                }

                endpoints.push(MockEndpoint {
                    id: Uuid::new_v4().to_string(),
                    path: path.clone(),
                    method: method.to_uppercase(),
                    scenarios,
                });
            }
        }
    }

    Ok(MockServerConfig {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        port,
        endpoints,
        cors_enabled: false,
        cors_config: CorsConfig::default(),
        headers: HashMap::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openapi_to_mock_config_valid_json() {
        let spec = r#"{
            "openapi": "3.0.0",
            "info": { "title": "Test API", "version": "1.0.0" },
            "paths": {
                "/users": {
                    "get": {
                        "summary": "List users",
                        "responses": {
                            "200": {
                                "description": "A list of users",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "array",
                                            "items": { "type": "object", "properties": { "id": { "type": "integer" }, "name": { "type": "string" } } }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "post": {
                        "summary": "Create user",
                        "responses": {
                            "201": {
                                "description": "Created"
                            }
                        }
                    }
                },
                "/health": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "OK",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": { "status": { "type": "string" } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }"#;

        let config = openapi_to_mock_config(spec, "My API", 8080).unwrap();
        assert_eq!(config.name, "My API");
        assert_eq!(config.port, 8080);
        // 3 operations: GET /users, POST /users, GET /health
        assert_eq!(config.endpoints.len(), 3);

        let users_get = config.endpoints.iter().find(|e| e.path == "/users" && e.method == "GET").unwrap();
        assert!(users_get.scenarios[0].is_default);
        assert!(users_get.scenarios[0].body.contains("\"id\""));
        assert!(users_get.scenarios[0].body.contains("\"name\""));

        let health = config.endpoints.iter().find(|e| e.path == "/health").unwrap();
        assert!(health.scenarios[0].body.contains("\"status\""));
    }

    #[test]
    fn test_openapi_to_mock_config_valid_yaml() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: YAML API
  version: "1.0"
paths:
  /items:
    get:
      summary: Get items
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
"#;

        let config = openapi_to_mock_config(spec, "YAML API", 9090).unwrap();
        assert_eq!(config.name, "YAML API");
        assert_eq!(config.port, 9090);
        assert_eq!(config.endpoints.len(), 1);
        assert_eq!(config.endpoints[0].path, "/items");
        assert_eq!(config.endpoints[0].method, "GET");
    }

    #[test]
    fn test_openapi_to_mock_config_no_paths_returns_error() {
        let spec = r#"{"openapi": "3.0.0", "info": {"title": "Empty", "version": "1.0"}}"#;
        let result = openapi_to_mock_config(spec, "Empty", 8080);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("paths"));
    }

    #[test]
    fn test_openapi_to_mock_config_invalid_json() {
        let result = openapi_to_mock_config("not valid json or yaml", "Bad", 8080);
        assert!(result.is_err());
    }

    #[test]
    fn test_openapi_to_mock_config_swagger_v2() {
        let spec = r#"{
            "swagger": "2.0",
            "info": { "title": "Pet Store", "version": "1.0" },
            "host": "petstore.example.com",
            "basePath": "/v1",
            "schemes": ["https"],
            "paths": {
                "/pets": {
                    "get": {
                        "summary": "List pets",
                        "responses": {
                            "200": {
                                "description": "OK",
                                "schema": {
                                    "type": "array",
                                    "items": { "type": "object", "properties": { "id": { "type": "integer" } } }
                                }
                            }
                        }
                    }
                }
            }
        }"#;

        let config = openapi_to_mock_config(spec, "Pet Store", 8080).unwrap();
        assert_eq!(config.endpoints.len(), 1);
        assert!(config.endpoints[0].scenarios[0].body.contains("\"id\""));
    }

    #[test]
    fn test_openapi_to_mock_config_default_scenario_when_no_responses() {
        let spec = r#"{
            "openapi": "3.0.0",
            "info": { "title": "Minimal", "version": "1.0" },
            "paths": {
                "/ping": {
                    "get": {
                        "summary": "Health check"
                    }
                }
            }
        }"#;

        let config = openapi_to_mock_config(spec, "Minimal", 8080).unwrap();
        assert_eq!(config.endpoints.len(), 1);
        // Should have a default scenario when no responses defined
        assert_eq!(config.endpoints[0].scenarios.len(), 1);
        assert!(config.endpoints[0].scenarios[0].is_default);
        assert_eq!(config.endpoints[0].scenarios[0].status_code, 200);
    }

    #[test]
    fn test_openapi_to_mock_config_multiple_status_codes() {
        let spec = r#"{
            "openapi": "3.0.0",
            "info": { "title": "Multi", "version": "1.0" },
            "paths": {
                "/users/{id}": {
                    "get": {
                        "summary": "Get user",
                        "responses": {
                            "200": { "description": "OK" },
                            "404": { "description": "Not Found" }
                        }
                    }
                }
            }
        }"#;

        let config = openapi_to_mock_config(spec, "Multi", 8080).unwrap();
        assert_eq!(config.endpoints[0].scenarios.len(), 2);
        // First should be default (2xx sorted first)
        assert!(config.endpoints[0].scenarios[0].is_default);
        assert_eq!(config.endpoints[0].scenarios[0].status_code, 200);
        assert_eq!(config.endpoints[0].scenarios[1].status_code, 404);
    }
}
