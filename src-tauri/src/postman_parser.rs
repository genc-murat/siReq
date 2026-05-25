use crate::models::*;
use serde_json::Value;
use uuid::Uuid;

/// Parse a Postman Collection v2.1 JSON string into a siReq Collection.
pub fn parse_postman_collection(input: &str, collection_name: Option<&str>) -> Result<Collection, String> {
    let root: Value = serde_json::from_str(input)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Validate it looks like a Postman collection
    let info = root.get("info")
        .ok_or_else(|| "Not a valid Postman collection: missing 'info' field".to_string())?;

    let name = collection_name
        .map(|s| s.to_string())
        .or_else(|| info.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "Imported Collection".to_string());

    let items = root.get("item")
        .and_then(|i| i.as_array())
        .ok_or_else(|| "Not a valid Postman collection: missing 'item' array".to_string())?;

    let mut requests: Vec<HttpRequest> = Vec::new();

    // Get collection-level auth and variables
    let collection_auth = root.get("auth");
    let collection_vars: Vec<(String, String)> = root.get("variable")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().filter_map(|v| {
                let key = v.get("key").and_then(|k| k.as_str())?;
                let value = v.get("value").and_then(|k| serde_json::to_string(k).ok())
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string();
                Some((key.to_string(), value))
            }).collect()
        })
        .unwrap_or_default();

    for item in items {
        flatten_postman_items(item, "", &collection_auth, &collection_vars, &mut requests);
    }

    let now = chrono::Utc::now().to_rfc3339();
    Ok(Collection {
        id: Uuid::new_v4().to_string(),
        name,
        requests,
        created_at: now.clone(),
        updated_at: now,
        variables: vec![],
    })
}

/// Recursively flatten Postman items (handling folders) into HttpRequest objects.
fn flatten_postman_items(
    item: &Value,
    folder_prefix: &str,
    collection_auth: &Option<&Value>,
    collection_vars: &[(String, String)],
    requests: &mut Vec<HttpRequest>,
) {
    let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("Unnamed");

    // Check if this is a folder (has nested "item" array) or a request
    if let Some(sub_items) = item.get("item").and_then(|i| i.as_array()) {
        // It's a folder — recurse
        let new_prefix = if folder_prefix.is_empty() {
            name.to_string()
        } else {
            format!("{} / {}", folder_prefix, name)
        };
        let folder_auth = item.get("auth").or(*collection_auth);
        for sub in sub_items {
            flatten_postman_items(sub, &new_prefix, &folder_auth, collection_vars, requests);
        }
    } else {
        // It's a request
        let request = item.get("request");
        let prefixed_name = if folder_prefix.is_empty() {
            name.to_string()
        } else {
            format!("{} / {}", folder_prefix, name)
        };
        // Extract events from the parent item
        let (pre_script, post_script) = parse_postman_events(item);
        if let Some(req) = parse_postman_request(
            request,
            &prefixed_name,
            item.get("auth").or(*collection_auth),
            collection_vars,
            &pre_script,
            &post_script,
        ) {
            requests.push(req);
        }
    }
}

/// Parse a single Postman request object into an HttpRequest.
fn parse_postman_request(
    request_val: Option<&Value>,
    name: &str,
    auth_val: Option<&Value>,
    _collection_vars: &[(String, String)],
    pre_script: &str,
    post_script: &str,
) -> Option<HttpRequest> {
    let request = request_val?;

    let pre_script = pre_script.to_string();
    let post_script = post_script.to_string();

    // Method
    let method_str = request.get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("GET");
    let method = match method_str.to_uppercase().as_str() {
        "GET" => HttpMethod::GET,
        "POST" => HttpMethod::POST,
        "PUT" => HttpMethod::PUT,
        "PATCH" => HttpMethod::PATCH,
        "DELETE" => HttpMethod::DELETE,
        "HEAD" => HttpMethod::HEAD,
        "OPTIONS" => HttpMethod::OPTIONS,
        "TRACE" => HttpMethod::TRACE,
        _ => HttpMethod::GET,
    };

    // URL
    let url = parse_postman_url(request.get("url"))?;

    // Headers
    let headers: Vec<KeyValue> = request.get("header")
        .and_then(|h| h.as_array())
        .map(|arr| {
            arr.iter().filter_map(|h| {
                let key = h.get("key").and_then(|k| k.as_str())?.to_string();
                let value = h.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let enabled = h.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false);
                Some(KeyValue {
                    key,
                    value: value.to_string(),
                    enabled: !enabled,
                    is_secret: false,
                })
            }).collect()
        })
        .unwrap_or_default();

    // Body
    let (body_type, body, form_fields) = parse_postman_body(request.get("body"));

    // Auth
    let auth = parse_postman_auth(auth_val);

    // Events are passed from the parent item.

    // Build full URL with query params
    let query_params: Vec<KeyValue> = request.get("url")
        .and_then(|u| u.get("query"))
        .and_then(|q| q.as_array())
        .map(|arr| {
            arr.iter().filter_map(|q| {
                let key = q.get("key").and_then(|k| k.as_str())?.to_string();
                let value = q.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let disabled = q.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false);
                Some(KeyValue {
                    key,
                    value: value.to_string(),
                    enabled: !disabled,
                    is_secret: false,
                })
            }).collect()
        })
        .unwrap_or_default();

    Some(HttpRequest {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        method,
        url,
        headers,
        query_params,
        body_type,
        body,
        form_fields,
        auth,
        settings: RequestSettings {
            timeout: 30,
            follow_redirects: true,
            ssl_verify: true,
            proxy: None,
        },
        pre_script,
        post_script,
    })
}

/// Parse a Postman URL into a raw URL string.
fn parse_postman_url(url_val: Option<&Value>) -> Option<String> {
    let url = url_val?;
    // Prefer raw if available
    if let Some(raw) = url.get("raw").and_then(|r| r.as_str()) {
        if !raw.is_empty() {
            return Some(raw.to_string());
        }
    }
    // Fallback: build from host + path
    let protocol = url.get("protocol").and_then(|p| p.as_str()).unwrap_or("https");
    let host: Vec<&str> = url.get("host")
        .and_then(|h| h.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    if host.is_empty() {
        // Try direct string
        if let Some(h) = url.get("host").and_then(|h| h.as_str()) {
            let path: String = url.get("path")
                .and_then(|p| p.as_array())
                .map(|arr| {
                    arr.iter().filter_map(|v| v.as_str()).map(|s| format!("/{}", s)).collect::<Vec<_>>().join("")
                })
                .unwrap_or_default();
            return Some(format!("{}://{}{}", protocol, h, path));
        }
        // Try as plain string URL
        return url.as_str().map(|s| s.to_string());
    }
    let host_str = host.join(".");
    let path: String = url.get("path")
        .and_then(|p| p.as_array())
        .map(|arr| {
            let segments: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            "/".to_string() + &segments.join("/")
        })
        .unwrap_or_default();

    Some(format!("{}://{}{}", protocol, host_str, path))
}

/// Parse a Postman body object into siReq's body representation.
fn parse_postman_body(body_val: Option<&Value>) -> (BodyType, String, Vec<FormField>) {
    let body = match body_val {
        Some(b) => b,
        None => return (BodyType::none, String::new(), vec![]),
    };

    let mode = body.get("mode").and_then(|m| m.as_str()).unwrap_or("raw");

    match mode {
        "raw" => {
            let raw = body.get("raw").and_then(|r| r.as_str()).unwrap_or("");
            // Determine content type from options
            let language = body.get("options")
                .and_then(|o| o.get("raw"))
                .and_then(|r| r.get("language"))
                .and_then(|l| l.as_str())
                .unwrap_or("json");

            let body_type = match language {
                "json" => BodyType::json,
                "xml" => BodyType::xml,
                "text" | "javascript" | "html" => BodyType::text,
                _ => BodyType::json,
            };

            (body_type, raw.to_string(), vec![])
        }
        "urlencoded" => {
            let fields: Vec<FormField> = body.get("urlencoded")
                .and_then(|u| u.as_array())
                .map(|arr| {
                    arr.iter().filter_map(|f| {
                        let key = f.get("key").and_then(|k| k.as_str())?.to_string();
                        let value = f.get("value").and_then(|v| v.as_str()).unwrap_or("");
                        let disabled = f.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false);
                        Some(FormField {
                            key,
                            value: value.to_string(),
                            file_path: None,
                            file_name: None,
                            file_data: None,
                            content_type: None,
                            field_type: "text".to_string(),
                            enabled: !disabled,
                        })
                    }).collect()
                })
                .unwrap_or_default();

            // Build body string from fields
            let body_str = fields.iter()
                .filter(|f| f.enabled)
                .map(|f| format!("{}={}", urlencoding(f.key.as_str()), urlencoding(f.value.as_str())))
                .collect::<Vec<_>>()
                .join("&");

            (BodyType::form_urlencoded, body_str, fields)
        }
        "formdata" => {
            let fields: Vec<FormField> = body.get("formdata")
                .and_then(|u| u.as_array())
                .map(|arr| {
                    arr.iter().filter_map(|f| {
                        let key = f.get("key").and_then(|k| k.as_str())?.to_string();
                        let value = f.get("value").and_then(|v| v.as_str()).unwrap_or("");
                        let ftype = f.get("type").and_then(|t| t.as_str()).unwrap_or("text");
                        let src = f.get("src").and_then(|s| s.as_str());
                        let content_type = f.get("contentType").and_then(|c| c.as_str());
                        let disabled = f.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false);
                        Some(FormField {
                            key,
                            value: value.to_string(),
                            file_path: if ftype == "file" { src.map(|s| s.to_string()) } else { None },
                            file_name: if ftype == "file" { src.and_then(|s| std::path::Path::new(s).file_name().map(|f| f.to_string_lossy().to_string())) } else { None },
                            file_data: None,
                            content_type: content_type.map(|c| c.to_string()),
                            field_type: ftype.to_string(),
                            enabled: !disabled,
                        })
                    }).collect()
                })
                .unwrap_or_default();

            (BodyType::form, String::new(), fields)
        }
        "file" => {
            // Can't import file bodies; skip
            (BodyType::none, String::new(), vec![])
        }
        "graphql" => {
            let query = body.get("graphql")
                .and_then(|g| g.get("query"))
                .and_then(|q| q.as_str())
                .unwrap_or("");
            (BodyType::json, query.to_string(), vec![])
        }
        _ => (BodyType::none, String::new(), vec![]),
    }
}

/// Parse Postman auth configuration into our AuthConfig.
fn parse_postman_auth(auth_val: Option<&Value>) -> AuthConfig {
    let auth = match auth_val {
        Some(a) => a,
        None => return AuthConfig {
            auth_type: AuthType::none,
            username: String::new(),
            password: String::new(),
            token: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
        },
    };

    let auth_type = auth.get("type").and_then(|t| t.as_str()).unwrap_or("noauth");
    let params = auth.get(auth_type)
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();

    let get_param = |key: &str| -> String {
        params.iter()
            .find(|p| p.get("key").and_then(|k| k.as_str()) == Some(key))
            .and_then(|p| p.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    match auth_type {
        "apikey" => AuthConfig {
            auth_type: AuthType::api_key,
            api_key: get_param("value"),
            api_key_name: get_param("key"),
            api_key_in: {
                let val = get_param("in");
                if val == "query" { "query".to_string() } else { "header".to_string() }
            },
            username: String::new(),
            password: String::new(),
            token: String::new(),
        },
        "bearer" => AuthConfig {
            auth_type: AuthType::bearer,
            token: get_param("token"),
            username: String::new(),
            password: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
        },
        "basic" => AuthConfig {
            auth_type: AuthType::basic,
            username: get_param("username"),
            password: get_param("password"),
            token: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
        },
        "digest" => AuthConfig {
            auth_type: AuthType::basic, // Best approximation
            username: get_param("username"),
            password: get_param("password"),
            token: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
        },
        _ => AuthConfig {
            auth_type: AuthType::none,
            username: String::new(),
            password: String::new(),
            token: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
        },
    }
}

/// Parse Postman events (pre-request and test scripts).
fn parse_postman_events(item: &Value) -> (String, String) {
    let events = item.get("event")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default();

    let mut pre_script = String::new();
    let mut post_script = String::new();

    for event in &events {
        let listen = event.get("listen").and_then(|l| l.as_str()).unwrap_or("");
        let exec = event.get("script")
            .and_then(|s| s.get("exec"))
            .and_then(|e| e.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();

        match listen {
            "prerequest" => pre_script = exec,
            "test" => post_script = exec,
            _ => {}
        }
    }

    (pre_script, post_script)
}

/// Simple URL encoding for form body building.
fn urlencoding(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("+"),
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// ============================================================================
// EXPORT — siReq Collection → Postman Collection v2.1 JSON
// ============================================================================

/// Export a siReq Collection to a Postman Collection v2.1 JSON string.
pub fn export_to_postman(collection: &Collection) -> Result<String, String> {
    let mut info = serde_json::Map::new();
    info.insert("name".to_string(), Value::String(collection.name.clone()));
    info.insert("_postman_id".to_string(), Value::String(collection.id.clone()));
    info.insert("description".to_string(), Value::String(format!("Exported from siReq at {}", collection.updated_at)));
    info.insert("schema".to_string(), Value::String(
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json".to_string()
    ));

    let items: Vec<Value> = collection.requests.iter()
        .map(|req| request_to_postman_item(req))
        .collect();

    let mut root = serde_json::Map::new();
    root.insert("info".to_string(), Value::Object(info));
    root.insert("item".to_string(), Value::Array(items));

    serde_json::to_string_pretty(&Value::Object(root))
        .map_err(|e| format!("Failed to serialize collection: {}", e))
}

/// Convert a single HttpRequest to a Postman item object.
fn request_to_postman_item(req: &HttpRequest) -> Value {
    let mut item = serde_json::Map::new();
    item.insert("name".to_string(), Value::String(req.name.clone()));

    // Build request object
    let request = build_postman_request(req);
    item.insert("request".to_string(), Value::Object(request));

    // Events (scripts)
    let events = build_postman_events(req);
    if !events.is_empty() {
        item.insert("event".to_string(), Value::Array(events));
    }

    Value::Object(item)
}

/// Build the request object for a Postman item.
fn build_postman_request(req: &HttpRequest) -> serde_json::Map<String, Value> {
    let mut request = serde_json::Map::new();

    // Method
    request.insert("method".to_string(), Value::String(match req.method {
        HttpMethod::GET => "GET",
        HttpMethod::POST => "POST",
        HttpMethod::PUT => "PUT",
        HttpMethod::PATCH => "PATCH",
        HttpMethod::DELETE => "DELETE",
        HttpMethod::HEAD => "HEAD",
        HttpMethod::OPTIONS => "OPTIONS",
        HttpMethod::TRACE => "TRACE",
    }.to_string()));

    // URL
    let url = build_postman_url(req);
    request.insert("url".to_string(), Value::Object(url));

    // Headers
    let headers: Vec<Value> = req.headers.iter()
        .map(|h| {
            let mut header = serde_json::Map::new();
            header.insert("key".to_string(), Value::String(h.key.clone()));
            header.insert("value".to_string(), Value::String(h.value.clone()));
            header.insert("type".to_string(), Value::String("text".to_string()));
            if !h.enabled {
                header.insert("disabled".to_string(), Value::Bool(true));
            }
            Value::Object(header)
        })
        .collect();
    request.insert("header".to_string(), Value::Array(headers));

    // Body
    let body = build_postman_body(req);
    request.insert("body".to_string(), Value::Object(body));

    // Auth
    let auth = build_postman_auth(req);
    if req.auth.auth_type != AuthType::none {
        request.insert("auth".to_string(), Value::Object(auth));
    }

    request
}

/// Build Postman URL from our request.
fn build_postman_url(req: &HttpRequest) -> serde_json::Map<String, Value> {
    let mut url = serde_json::Map::new();
    url.insert("raw".to_string(), Value::String(req.url.clone()));

    // Try to parse the URL into components
    if let Ok(parsed) = url::Url::parse(&req.url) {
        if let Some(host) = parsed.host_str() {
            url.insert("host".to_string(), Value::Array(
                host.split('.').map(|s| Value::String(s.to_string())).collect()
            ));
        }
        url.insert("protocol".to_string(), Value::String(parsed.scheme().to_string()));
        // Build path segments from the path string
        let path = parsed.path().trim_start_matches('/');
        if !path.is_empty() {
            let segments: Vec<Value> = path
                .split('/')
                .map(|s| Value::String(s.to_string()))
                .collect();
            url.insert("path".to_string(), Value::Array(segments));
        }
    }

    // Query params
    if !req.query_params.is_empty() {
        let query: Vec<Value> = req.query_params.iter()
            .map(|q| {
                let mut qv = serde_json::Map::new();
                qv.insert("key".to_string(), Value::String(q.key.clone()));
                qv.insert("value".to_string(), Value::String(q.value.clone()));
                if !q.enabled {
                    qv.insert("disabled".to_string(), Value::Bool(true));
                }
                Value::Object(qv)
            })
            .collect();
        url.insert("query".to_string(), Value::Array(query));
    }

    url
}

/// Build Postman body from our request.
fn build_postman_body(req: &HttpRequest) -> serde_json::Map<String, Value> {
    let mut body = serde_json::Map::new();

    match req.body_type {
        BodyType::none => {
            body.insert("mode".to_string(), Value::String("raw".to_string()));
            body.insert("raw".to_string(), Value::String(String::new()));
        }
        BodyType::json => {
            body.insert("mode".to_string(), Value::String("raw".to_string()));
            body.insert("raw".to_string(), Value::String(req.body.clone()));
            let mut options = serde_json::Map::new();
            let mut raw_opts = serde_json::Map::new();
            raw_opts.insert("language".to_string(), Value::String("json".to_string()));
            options.insert("raw".to_string(), Value::Object(raw_opts));
            body.insert("options".to_string(), Value::Object(options));
        }
        BodyType::xml => {
            body.insert("mode".to_string(), Value::String("raw".to_string()));
            body.insert("raw".to_string(), Value::String(req.body.clone()));
            let mut options = serde_json::Map::new();
            let mut raw_opts = serde_json::Map::new();
            raw_opts.insert("language".to_string(), Value::String("xml".to_string()));
            options.insert("raw".to_string(), Value::Object(raw_opts));
            body.insert("options".to_string(), Value::Object(options));
        }
        BodyType::text => {
            body.insert("mode".to_string(), Value::String("raw".to_string()));
            body.insert("raw".to_string(), Value::String(req.body.clone()));
            let mut options = serde_json::Map::new();
            let mut raw_opts = serde_json::Map::new();
            raw_opts.insert("language".to_string(), Value::String("text".to_string()));
            options.insert("raw".to_string(), Value::Object(raw_opts));
            body.insert("options".to_string(), Value::Object(options));
        }
        BodyType::form => {
            body.insert("mode".to_string(), Value::String("formdata".to_string()));
            let formdata: Vec<Value> = req.form_fields.iter()
                .map(|f| {
                    let mut fd = serde_json::Map::new();
                    fd.insert("key".to_string(), Value::String(f.key.clone()));
                    fd.insert("value".to_string(), Value::String(f.value.clone()));
                    fd.insert("type".to_string(), Value::String(f.field_type.clone()));
                    if !f.enabled {
                        fd.insert("disabled".to_string(), Value::Bool(true));
                    }
                    if let Some(ct) = &f.content_type {
                        fd.insert("contentType".to_string(), Value::String(ct.clone()));
                    }
                    if let Some(fp) = &f.file_path {
                        fd.insert("src".to_string(), Value::String(fp.clone()));
                    }
                    Value::Object(fd)
                })
                .collect();
            body.insert("formdata".to_string(), Value::Array(formdata));
        }
        BodyType::form_urlencoded => {
            body.insert("mode".to_string(), Value::String("urlencoded".to_string()));
            let urlencoded: Vec<Value> = req.form_fields.iter()
                .filter(|f| f.field_type == "text")
                .map(|f| {
                    let mut fd = serde_json::Map::new();
                    fd.insert("key".to_string(), Value::String(f.key.clone()));
                    fd.insert("value".to_string(), Value::String(f.value.clone()));
                    fd.insert("type".to_string(), Value::String("text".to_string()));
                    if !f.enabled {
                        fd.insert("disabled".to_string(), Value::Bool(true));
                    }
                    Value::Object(fd)
                })
                .collect();
            body.insert("urlencoded".to_string(), Value::Array(urlencoded));
        }
    }

    body
}

/// Build Postman auth configuration from our AuthConfig.
fn build_postman_auth(req: &HttpRequest) -> serde_json::Map<String, Value> {
    let mut auth = serde_json::Map::new();

    match req.auth.auth_type {
        AuthType::none => {
            auth.insert("type".to_string(), Value::String("noauth".to_string()));
            auth.insert("noauth".to_string(), Value::Array(vec![]));
        }
        AuthType::basic => {
            auth.insert("type".to_string(), Value::String("basic".to_string()));
            auth.insert("basic".to_string(), Value::Array(vec![
                auth_param("username", &req.auth.username),
                auth_param("password", &req.auth.password),
            ]));
        }
        AuthType::bearer => {
            auth.insert("type".to_string(), Value::String("bearer".to_string()));
            auth.insert("bearer".to_string(), Value::Array(vec![
                auth_param("token", &req.auth.token),
            ]));
        }
        AuthType::api_key => {
            auth.insert("type".to_string(), Value::String("apikey".to_string()));
            auth.insert("apikey".to_string(), Value::Array(vec![
                auth_param("key", &req.auth.api_key_name),
                auth_param("value", &req.auth.api_key),
                auth_param("in", &req.auth.api_key_in),
            ]));
        }
    }

    auth
}

fn auth_param(key: &str, value: &str) -> Value {
    let mut p = serde_json::Map::new();
    p.insert("key".to_string(), Value::String(key.to_string()));
    p.insert("value".to_string(), Value::String(value.to_string()));
    p.insert("type".to_string(), Value::String("string".to_string()));
    Value::Object(p)
}

/// Build Postman events (scripts) from our request.
fn build_postman_events(req: &HttpRequest) -> Vec<Value> {
    let mut events = Vec::new();

    if !req.pre_script.is_empty() {
        let mut event = serde_json::Map::new();
        event.insert("listen".to_string(), Value::String("prerequest".to_string()));
        let mut script = serde_json::Map::new();
        let exec_lines: Vec<Value> = req.pre_script.lines().map(|l| Value::String(l.to_string())).collect();
        script.insert("exec".to_string(), Value::Array(exec_lines));
        script.insert("type".to_string(), Value::String("text/javascript".to_string()));
        event.insert("script".to_string(), Value::Object(script));
        events.push(Value::Object(event));
    }

    if !req.post_script.is_empty() {
        let mut event = serde_json::Map::new();
        event.insert("listen".to_string(), Value::String("test".to_string()));
        let mut script = serde_json::Map::new();
        let exec_lines: Vec<Value> = req.post_script.lines().map(|l| Value::String(l.to_string())).collect();
        script.insert("exec".to_string(), Value::Array(exec_lines));
        script.insert("type".to_string(), Value::String("text/javascript".to_string()));
        event.insert("script".to_string(), Value::Object(script));
        events.push(Value::Object(event));
    }

    events
}
