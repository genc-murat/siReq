use base64::Engine;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use crate::models::*;

pub struct RequestHandles(pub Mutex<HashMap<String, tokio::task::JoinHandle<()>>>);

/// Extract the host domain from a URL string.
pub fn extract_domain(url: &str) -> Option<String> {
    url::Url::parse(url).ok().and_then(|parsed| {
        parsed.host_str().map(|h| h.to_string())
    })
}

/// Format a list of stored cookies into a "Cookie" header value.
pub fn format_cookie_header(cookies: &[StoredCookie]) -> String {
    cookies.iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ")
}

/// Parse a single `Set-Cookie` header value into a `StoredCookie`.
/// `default_domain` is the request host used when no Domain attribute is present.
/// Returns `None` if the cookie is expired (Max-Age=0 or past Expires).
pub fn parse_set_cookie(set_cookie: &str, default_domain: &str) -> Option<StoredCookie> {
    let parts: Vec<&str> = set_cookie.split(';').collect();
    if parts.is_empty() {
        return None;
    }

    // First part is name=value
    let nv = parts[0].trim();
    let (name, value) = if let Some(eq_pos) = nv.find('=') {
        let n = nv[..eq_pos].trim().to_string();
        let v = nv[eq_pos + 1..].trim().to_string();
        (n, v)
    } else {
        return None;
    };

    let mut domain = default_domain.to_string();
    let mut path = "/".to_string();
    let mut secure = false;
    let mut http_only = false;
    let mut expires: Option<String> = None;

    for part in &parts[1..] {
        let attr = part.trim();
        if let Some(eq_pos) = attr.find('=') {
            let key = attr[..eq_pos].trim().to_lowercase();
            let val = attr[eq_pos + 1..].trim().to_string();
            match key.as_str() {
                "domain" => {
                    let d = val.trim_start_matches('.');
                    domain = d.to_string();
                }
                "path" => path = val,
                "expires" => expires = Some(val),
                "max-age" => {
                    // Max-Age=0 means delete the cookie
                    if let Ok(seconds) = val.parse::<i64>() {
                        if seconds <= 0 {
                            return None;
                        }
                    }
                    expires = Some(format!("max-age={}", val));
                }
                _ => {}
            }
        } else {
            match attr.to_lowercase().as_str() {
                "secure" => secure = true,
                "httponly" => http_only = true,
                _ => {}
            }
        }
    }

    Some(StoredCookie {
        id: uuid::Uuid::new_v4().to_string(),
        domain,
        path,
        name,
        value,
        secure,
        http_only,
        expires,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Execute an HTTP request with cookie support.
///
/// `stored_cookies` are previously saved cookies loaded from the database.
/// On success, returns `(HttpResponse, Vec<StoredCookie>)` where the second
/// element contains cookies parsed from Set-Cookie headers.
pub async fn execute_request(
    _client: &Client,
    request: &HttpRequest,
    stored_cookies: &[StoredCookie],
) -> Result<(HttpResponse, Vec<StoredCookie>), String> {
    let method = match request.method {
        HttpMethod::GET => reqwest::Method::GET,
        HttpMethod::POST => reqwest::Method::POST,
        HttpMethod::PUT => reqwest::Method::PUT,
        HttpMethod::PATCH => reqwest::Method::PATCH,
        HttpMethod::DELETE => reqwest::Method::DELETE,
        HttpMethod::HEAD => reqwest::Method::HEAD,
        HttpMethod::OPTIONS => reqwest::Method::OPTIONS,
        HttpMethod::TRACE => reqwest::Method::TRACE,
    };

    let timeout = if request.settings.timeout > 0 {
        Duration::from_secs(request.settings.timeout)
    } else {
        Duration::from_secs(30)
    };

    let mut client_builder = Client::builder()
        .timeout(timeout);

    if !request.settings.follow_redirects {
        client_builder = client_builder.redirect(reqwest::redirect::Policy::none());
    }

    if !request.settings.ssl_verify {
        client_builder = client_builder.danger_accept_invalid_certs(true);
    }

    // Configure proxy if enabled
    if let Some(ref proxy_config) = request.settings.proxy {
        if proxy_config.enabled && !proxy_config.url.is_empty() {
            let mut proxy = reqwest::Proxy::all(&proxy_config.url)
                .map_err(|e| format!("Invalid proxy URL: {}", e))?;
            if !proxy_config.username.is_empty() {
                proxy = proxy.basic_auth(&proxy_config.username, &proxy_config.password);
            }
            client_builder = client_builder.proxy(proxy);
        }
    }

    let per_request_client = client_builder.build().map_err(|e| e.to_string())?;

    let mut req_builder = per_request_client
        .request(method, &request.url);

    for kv in &request.headers {
        if kv.enabled && !kv.key.is_empty() {
            req_builder = req_builder.header(&kv.key, &kv.value);
        }
    }

    // Add stored cookies as a Cookie header
    if !stored_cookies.is_empty() {
        let cookie_header = format_cookie_header(stored_cookies);
        req_builder = req_builder.header("Cookie", cookie_header);
    }

    for kv in &request.query_params {
        if kv.enabled && !kv.key.is_empty() {
            req_builder = req_builder.query(&[(&kv.key, &kv.value)]);
        }
    }

    match &request.auth.auth_type {
        AuthType::basic => {
            if !request.auth.username.is_empty() {
                req_builder = req_builder.basic_auth(&request.auth.username, Some(&request.auth.password));
            }
        }
        AuthType::bearer => {
            if !request.auth.token.is_empty() {
                req_builder = req_builder.bearer_auth(&request.auth.token);
            }
        }
        AuthType::api_key => {
            if !request.auth.api_key.is_empty() && !request.auth.api_key_name.is_empty() {
                if request.auth.api_key_in == "query" {
                    req_builder = req_builder.query(&[(&request.auth.api_key_name, &request.auth.api_key)]);
                } else {
                    req_builder = req_builder.header(&request.auth.api_key_name, &request.auth.api_key);
                }
            }
        }
        AuthType::none => {}
    }

    match request.body_type {
        BodyType::json => {
            if !request.body.is_empty() {
                req_builder = req_builder.header("content-type", "application/json").body(request.body.clone());
            }
        }
        BodyType::xml => {
            if !request.body.is_empty() {
                req_builder = req_builder.header("content-type", "application/xml").body(request.body.clone());
            }
        }
        BodyType::text => {
            if !request.body.is_empty() {
                req_builder = req_builder.header("content-type", "text/plain").body(request.body.clone());
            }
        }
        BodyType::form_urlencoded => {
            let mut pairs: Vec<(String, String)> = vec![];
            if let Ok(map) = serde_json::from_str::<serde_json::Value>(&request.body) {
                if let Some(obj) = map.as_object() {
                    for (k, v) in obj {
                        pairs.push((k.clone(), v.as_str().unwrap_or("").to_string()));
                    }
                }
            }
            req_builder = req_builder.form(&pairs);
        }
        BodyType::form => {
            let mut form = reqwest::multipart::Form::new();
            if !request.form_fields.is_empty() {
                for field in &request.form_fields {
                    if !field.enabled || field.key.is_empty() {
                        continue;
                    }
                    if field.field_type == "file" {
                        let file_bytes: Vec<u8> = if let Some(ref file_data) = field.file_data {
                            base64::engine::general_purpose::STANDARD
                                .decode(file_data)
                                .unwrap_or_else(|_| field.value.as_bytes().to_vec())
                        } else {
                            field.value.as_bytes().to_vec()
                        };
                        let file_name = field.file_name.clone()
                            .unwrap_or_else(|| format!("file_{}", field.key));
                        let content_type = field.content_type.clone()
                            .unwrap_or_else(|| "application/octet-stream".to_string());
                        let part = reqwest::multipart::Part::bytes(file_bytes)
                            .file_name(file_name)
                            .mime_str(&content_type)
                            .map_err(|e| e.to_string())?;
                        form = form.part(field.key.clone(), part);
                    } else {
                        form = form.text(field.key.clone(), field.value.clone());
                    }
                }
            } else {
                if let Ok(map) = serde_json::from_str::<serde_json::Value>(&request.body) {
                    if let Some(obj) = map.as_object() {
                        for (k, v) in obj {
                            form = form.text(k.clone(), v.as_str().unwrap_or("").to_string());
                        }
                    }
                }
            }
            req_builder = req_builder.multipart(form);
        }
        BodyType::none => {}
    }

    let start = Instant::now();
    let response = req_builder.send().await.map_err(|e| e.to_string())?;
    let elapsed = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let headers: Vec<(String, String)> = response.headers().iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    // Parse Set-Cookie headers into response cookies + stored cookies
    let set_cookie_headers: Vec<String> = response.headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    let domain = extract_domain(&request.url).unwrap_or_default();

    let response_cookies: Vec<(String, String)> = set_cookie_headers.iter()
        .filter_map(|sc| {
            let parts: Vec<&str> = sc.split(';').collect();
            if parts.is_empty() { return None; }
            let nv = parts[0].trim();
            let eq_pos = nv.find('=')?;
            let n = nv[..eq_pos].trim().to_string();
            let v = nv[eq_pos + 1..].trim().to_string();
            Some((n, v))
        })
        .collect();

    let new_cookies: Vec<StoredCookie> = set_cookie_headers.iter()
        .filter_map(|sc| parse_set_cookie(sc, &domain))
        .collect();

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let size = bytes.len() as u64;

    let content_type_header = headers.iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .map(|(_, v)| v.as_str())
        .unwrap_or("");

    let is_binary = content_type_header.starts_with("image/")
        || content_type_header.starts_with("application/pdf")
        || content_type_header.starts_with("application/octet-stream")
        || content_type_header.starts_with("application/zip")
        || content_type_header.starts_with("application/vnd")
        || content_type_header.starts_with("audio/")
        || content_type_header.starts_with("video/");

    let (body, body_base64) = if is_binary {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let text = String::from_utf8_lossy(&bytes).to_string();
        (text, Some(b64))
    } else {
        let text = String::from_utf8_lossy(&bytes).to_string();
        (text, None)
    };

    let http_response = HttpResponse {
        status,
        status_text,
        headers,
        cookies: response_cookies,
        body,
        body_base64,
        size,
        time_ms: elapsed,
        script_logs: vec![],
        test_results: vec![],
        modified_variables: vec![],
    };

    Ok((http_response, new_cookies))
}

pub fn cancel_request(handles: &RequestHandles, request_id: &str) -> Result<(), String> {
    let mut map = handles.0.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = map.remove(request_id) {
        handle.abort();
    }
    Ok(())
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use crate::variables::apply_variables;
    use std::collections::HashMap;

    /// Start a raw TCP server that captures the first HTTP request it receives.
    /// Returns `(port, Arc<Mutex<String>>)` where the String is the raw HTTP request text.
    async fn start_capture_server() -> (u16, Arc<Mutex<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let captured: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let cap = captured.clone();

        tokio::spawn(async move {
            // Accept one connection
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut buf = vec![0u8; 16384];
                match stream.read(&mut buf).await {
                    Ok(n) if n > 0 => {
                        let raw = String::from_utf8_lossy(&buf[..n]).to_string();
                        // Drop the lock before the .await to avoid holding a non-Send MutexGuard across await
                        {
                            let mut guard = cap.lock().unwrap();
                            *guard = raw;
                        }
                        // Send minimal valid HTTP response
                        let _ = stream.write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: text/plain\r\n\r\nOK"
                        ).await;
                    }
                    _ => {}
                }
            }
        });

        (port, captured)
    }

    /// Helper: minimal HttpRequest for integration tests.
    fn test_request(
        url: &str,
        method: HttpMethod,
        headers: Vec<(&str, &str)>,
        query_params: Vec<(&str, &str)>,
        body: &str,
        body_type: BodyType,
    ) -> HttpRequest {
        HttpRequest {
            id: "int-test".into(),
            name: String::new(),
            method,
            url: url.into(),
            headers: headers.into_iter().map(|(k, v)| KeyValue {
                key: k.into(),
                value: v.into(),
                enabled: true,
                is_secret: false,
            }).collect(),
            query_params: query_params.into_iter().map(|(k, v)| KeyValue {
                key: k.into(),
                value: v.into(),
                enabled: true,
                is_secret: false,
            }).collect(),
            body_type,
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
                timeout: 5,
                follow_redirects: false,
                ssl_verify: false,
                proxy: None,
            },
            pre_script: String::new(),
            post_script: String::new(),
            examples: vec![],
            extractions: vec![],
        }
    }

    #[tokio::test]
    async fn test_integration_variable_resolution_url() {
        // {{host}} and {{port}} in URL should be resolved before sending
        let (port, captured) = start_capture_server().await;
        let addr = format!("127.0.0.1:{}", port);

        let request = test_request(
            "http://{{addr}}/api/users",
            HttpMethod::GET,
            vec![],
            vec![],
            "",
            BodyType::none,
        );

        let env_vars: HashMap<String, String> = [
            ("addr".into(), addr.clone()),
        ].into();

        let resolved = apply_variables(&request, &[], &[], &env_vars, &[]);
        let client = Client::new();
        let result = execute_request(&client, &resolved, &[]).await;

        assert!(result.is_ok(), "execute_request should succeed: {:?}", result.err());

        // Wait briefly for the server to capture the request
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        // The request line should contain the resolved path
        assert!(raw.contains("GET /api/users HTTP"), "Request line should have resolved path. Got: {}", raw);
        // The Host header should contain the resolved address
        assert!(raw.contains(&format!("host: {}", addr)), "Host header should be resolved. Got: {}", raw);
    }

    #[tokio::test]
    async fn test_integration_variable_resolution_headers() {
        // {{token}} in Authorization should be resolved before sending
        let (port, captured) = start_capture_server().await;

        let request = test_request(
            &format!("http://127.0.0.1:{}/api/data", port),
            HttpMethod::GET,
            vec![("Authorization", "Bearer {{token}}")],
            vec![],
            "",
            BodyType::none,
        );

        let env_vars: HashMap<String, String> = [
            ("token".into(), "secret-test-token-123".into()),
        ].into();

        let resolved = apply_variables(&request, &[], &[], &env_vars, &[]);
        let client = Client::new();
        let result = execute_request(&client, &resolved, &[]).await;

        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        assert!(
            raw.contains("Bearer secret-test-token-123"),
            "Authorization header should have resolved token. Got: {}",
            raw.lines().find(|l| l.to_lowercase().starts_with("authorization")).unwrap_or("<not found>")
        );
        // Ensure the raw {{token}} is NOT present
        assert!(!raw.contains("{{token}}"), "Raw {{token}} should not appear in request");
    }

    #[tokio::test]
    async fn test_integration_variable_resolution_body() {
        // {{body_key}} and {{body_value}} in JSON body should be resolved before sending
        let (port, captured) = start_capture_server().await;

        let request = test_request(
            &format!("http://127.0.0.1:{}/api/submit", port),
            HttpMethod::POST,
            vec![],
            vec![],
            r#"{"key": "{{body_key}}", "value": "{{body_value}}"}"#,
            BodyType::json,
        );

        let env_vars: HashMap<String, String> = [
            ("body_key".into(), "test-key".into()),
            ("body_value".into(), "test-value".into()),
        ].into();

        let resolved = apply_variables(&request, &[], &[], &env_vars, &[]);
        assert_eq!(
            resolved.body,
            r#"{"key": "test-key", "value": "test-value"}"#,
            "Body should be resolved"
        );

        let client = Client::new();
        let result = execute_request(&client, &resolved, &[]).await;

        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        assert!(raw.contains("test-key"), "Body should contain resolved key");
        assert!(raw.contains("test-value"), "Body should contain resolved value");
        assert!(!raw.contains("{{body_key}}"), "Raw {{body_key}} should not appear");
        assert!(!raw.contains("{{body_value}}"), "Raw {{body_value}} should not appear");
    }

    #[tokio::test]
    async fn test_integration_variable_resolution_query_params() {
        // {{page}} and {{limit}} in query params should be resolved before sending
        let (port, captured) = start_capture_server().await;

        let request = test_request(
            &format!("http://127.0.0.1:{}/api/search", port),
            HttpMethod::GET,
            vec![],
            vec![("page", "{{page}}"), ("limit", "{{limit}}")],
            "",
            BodyType::none,
        );

        let env_vars: HashMap<String, String> = [
            ("page".into(), "2".into()),
            ("limit".into(), "50".into()),
        ].into();

        let resolved = apply_variables(&request, &[], &[], &env_vars, &[]);
        assert_eq!(
            resolved.url,
            format!("http://127.0.0.1:{}/api/search", port),
            "URL should not include query params (they are sent separately)"
        );

        let client = Client::new();
        let result = execute_request(&client, &resolved, &[]).await;
        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        assert!(raw.contains("page=2"), "Query param page should be resolved");
        assert!(raw.contains("limit=50"), "Query param limit should be resolved");
        assert!(!raw.contains("{{page}}"), "Raw {{page}} should not appear");
        assert!(!raw.contains("{{limit}}"), "Raw {{limit}} should not appear");
    }

    #[tokio::test]
    async fn test_integration_variable_resolution_missing_var_passthrough() {
        // {{missing}} with no matching variable should stay as-is in the actual request
        let (port, captured) = start_capture_server().await;

        let request = test_request(
            &format!("http://127.0.0.1:{}/{{{{missing}}}}", port),
            HttpMethod::GET,
            vec![("X-Custom", "{{missing}}")],
            vec![],
            "",
            BodyType::none,
        );

        let env_vars: HashMap<String, String> = HashMap::new(); // No variable defined

        let resolved = apply_variables(&request, &[], &[], &env_vars, &[]);
        // The {{missing}} should remain as-is in the resolved request
        assert!(resolved.url.contains("{{missing}}"), "Missing var should stay in URL");
        assert!(resolved.headers[0].value.contains("{{missing}}"), "Missing var should stay in headers");

        // When execute_request sends this, it will actually send {{missing}} literally
        // reqwest will try to connect to that URL which has {{missing}} as the path
        let client = Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let result = execute_request(&client, &resolved, &[]).await;
        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        // reqwest URL-encodes { and } as %7B and %7D in the path
        assert!(raw.contains("%7B%7Bmissing%7D%7D"), "Raw {{missing}} should appear (URL-encoded) in the sent request");
        // It should be in the request line (URL-encoded)
        assert!(raw.contains("GET /%7B%7Bmissing%7D%7D HTTP"), "Path should contain unresolved {{missing}}, URL-encoded");
    }

    #[tokio::test]
    async fn test_integration_variable_resolution_all_scopes() {
        // Test global + env + script variable priority in full pipeline
        let (port, captured) = start_capture_server().await;

        let request = test_request(
            &format!("http://127.0.0.1:{}/{{{{global_var}}}}/{{{{env_var}}}}/{{{{script_var}}}}/{{{{override_var}}}}", port),
            HttpMethod::GET,
            vec![],
            vec![],
            "",
            BodyType::none,
        );

        // Global variables
        let global = vec![
            KeyValue { key: "global_var".into(), value: "global_val".into(), enabled: true, is_secret: false },
            KeyValue { key: "override_var".into(), value: "global_override".into(), enabled: true, is_secret: false },
        ];

        // Environment variables (overrides global)
        let mut env = HashMap::new();
        env.insert("env_var".into(), "env_val".into());
        env.insert("override_var".into(), "env_override".into());

        // Script variables (highest priority — overrides env)
        let script = vec![
            KeyValue { key: "script_var".into(), value: "script_val".into(), enabled: true, is_secret: false },
            KeyValue { key: "override_var".into(), value: "script_override".into(), enabled: true, is_secret: false },
        ];

        let resolved = apply_variables(&request, &global, &[], &env, &script);

        // Verify resolution is correct before sending
        assert!(resolved.url.contains("global_val"), "Should contain global_val");
        assert!(resolved.url.contains("env_val"), "Should contain env_val");
        assert!(resolved.url.contains("script_val"), "Should contain script_val");
        assert!(resolved.url.contains("script_override"), "Script should override env and global");

        let client = Client::new();
        let result = execute_request(&client, &resolved, &[]).await;
        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        // The request line should have the fully resolved path with all scopes
        assert!(raw.contains("/global_val/env_val/script_val/script_override"),
            "Path should have correct scope priority. Got: {}", raw.lines().next().unwrap_or("<no request line>"));
    }

    #[tokio::test]
    async fn test_integration_dynamic_vars_in_request() {
        // {{$uuid}} and {{$timestamp}} should be resolved before sending
        let (port, captured) = start_capture_server().await;

        // Use string concatenation to avoid format! escaping issues with {{$uuid}} / {{$timestamp}}
        let base_url = format!("http://127.0.0.1:{}", port);
        let url = base_url + "/log?ts={{$timestamp}}&id={{$uuid}}";
        let request = test_request(
            &url,
            HttpMethod::GET,
            vec![("X-Request-Id", "{{$uuid}}")],
            vec![],
            "",
            BodyType::none,
        );

        // No static vars needed — dynamic vars are resolved by apply_variables automatically
        let resolved = apply_variables(&request, &[], &[], &HashMap::new(), &[]);

        // The dynamic vars should be resolved
        assert!(!resolved.url.contains("{{$uuid}}"), "$uuid should be resolved");
        assert!(!resolved.url.contains("{{$timestamp}}"), "$timestamp should be resolved");

        let client = Client::new();
        let result = execute_request(&client, &resolved, &[]).await;
        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        // Should contain a UUID-like value (36 chars of hex + dashes)
        assert!(raw.contains("id="), "Should have id query param");
        // Extract the id value and verify it looks like a UUID
        if let Some(id_start) = raw.find("id=") {
            let id_val = &raw[id_start + 3..id_start + 3 + 36];
            assert_eq!(id_val.len(), 36, "UUID should be 36 chars");
        }

        // Should have a numeric timestamp
        assert!(raw.contains("ts="), "Should have ts query param");
    }

    #[tokio::test]
    async fn test_integration_disabled_global_var_skipped() {
        // A disabled global variable should NOT be resolved in the sent request
        let (port, captured) = start_capture_server().await;

        let request = test_request(
            &format!("http://127.0.0.1:{}/{{{{key}}}}", port),
            HttpMethod::GET,
            vec![],
            vec![],
            "",
            BodyType::none,
        );

        // Disabled global var
        let global = vec![
            KeyValue { key: "key".into(), value: "should_not_appear".into(), enabled: false, is_secret: false },
        ];

        let resolved = apply_variables(&request, &global, &[], &HashMap::new(), &[]);
        assert!(resolved.url.contains("{{key}}"), "Disabled var should remain unresolved");

        let client = Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let result = execute_request(&client, &resolved, &[]).await;
        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let raw = captured.lock().unwrap().clone();

        // reqwest URL-encodes { and } as %7B and %7D in the path
        assert!(raw.contains("%7B%7Bkey%7D%7D"), "Disabled global var should NOT be resolved in the sent request");
        assert!(!raw.contains("should_not_appear"), "The disabled var's value should not appear");
    }
}

