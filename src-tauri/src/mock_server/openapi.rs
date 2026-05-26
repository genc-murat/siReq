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
