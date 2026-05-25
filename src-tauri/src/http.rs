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
