use serde_json::Value;
use crate::models::{HttpRequest, HttpResponse, HttpMethod, BodyType, AuthConfig, RequestSettings, KeyValue};
use super::models::HarEntry;

#[derive(serde::Deserialize)]
struct Har {
    log: HarLog,
}

#[derive(serde::Deserialize)]
struct HarLog {
    entries: Vec<HarRawEntry>,
}

#[derive(serde::Deserialize)]
struct HarRawEntry {
    request: HarRequest,
    response: HarResponse,
}

#[derive(serde::Deserialize)]
#[allow(non_snake_case)]
struct HarRequest {
    method: String,
    url: String,
    #[serde(default)]
    headers: Vec<HarHeader>,
    #[serde(default)]
    queryString: Vec<HarQueryString>,
    #[serde(default)]
    postData: Option<HarPostData>,
}

#[derive(serde::Deserialize)]
#[allow(non_snake_case)]
struct HarResponse {
    status: u16,
    statusText: String,
    #[serde(default)]
    headers: Vec<HarHeader>,
    #[serde(default)]
    content: HarContent,
    #[serde(default)]
    _timings: Value,
}

#[derive(serde::Deserialize)]
struct HarHeader {
    name: String,
    value: String,
}

#[derive(serde::Deserialize)]
struct HarQueryString {
    name: String,
    value: String,
}

#[derive(serde::Deserialize)]
#[allow(non_snake_case)]
struct HarPostData {
    #[serde(default)]
    mimeType: String,
    #[serde(default)]
    text: String,
}

#[derive(serde::Deserialize, Default)]
struct HarContent {
    #[serde(default)]
    text: String,
    #[serde(default)]
    size: u64,
}

pub fn parse_har(json_str: &str) -> Result<Vec<HarEntry>, String> {
    let har: Har = serde_json::from_str(json_str).map_err(|e| format!("Invalid HAR JSON: {}", e))?;

    let mut entries = Vec::new();
    for raw in har.log.entries {
        let method = parse_har_method(&raw.request.method);

        let headers: Vec<KeyValue> = raw.request.headers.iter()
            .map(|h| KeyValue { key: h.name.clone(), value: h.value.clone(), enabled: true, is_secret: false })
            .collect();

        let query_params: Vec<KeyValue> = raw.request.queryString.iter()
            .map(|q| KeyValue { key: q.name.clone(), value: q.value.clone(), enabled: true, is_secret: false })
            .collect();

        let (body, body_type) = match &raw.request.postData {
            Some(pd) => {
                let bt = if pd.mimeType.contains("json") {
                    BodyType::json
                } else if pd.mimeType.contains("xml") {
                    BodyType::xml
                } else if pd.mimeType.contains("form") && !pd.mimeType.contains("urlencoded") {
                    BodyType::form
                } else if pd.mimeType.contains("urlencoded") {
                    BodyType::form_urlencoded
                } else {
                    BodyType::text
                };
                (pd.text.clone(), bt)
            }
            None => (String::new(), BodyType::none),
        };

        let request = HttpRequest {
            id: uuid::Uuid::new_v4().to_string(),
            name: String::new(),
            method,
            url: raw.request.url,
            headers,
            query_params,
            body_type,
            body,
            form_fields: vec![],
            auth: AuthConfig {
                auth_type: crate::models::AuthType::none,
                username: String::new(),
                password: String::new(),
                token: String::new(),
                api_key: String::new(),
                api_key_name: String::new(),
                api_key_in: String::new(),
            },
            settings: RequestSettings {
                timeout: 30,
                follow_redirects: true,
                ssl_verify: true,
                proxy: None,
            },
            pre_script: String::new(),
            post_script: String::new(),
            examples: vec![],
            extractions: vec![],
        };

        let resp_headers: Vec<(String, String)> = raw.response.headers.iter()
            .map(|h| (h.name.clone(), h.value.clone()))
            .collect();

        let response = HttpResponse {
            status: raw.response.status,
            status_text: raw.response.statusText,
            headers: resp_headers,
            cookies: vec![],
            body: raw.response.content.text,
            body_base64: None,
            size: raw.response.content.size,
            time_ms: 0,
            script_logs: vec![],
            test_results: vec![],
            modified_variables: vec![],
        };

        entries.push(HarEntry { request, response });
    }

    Ok(entries)
}

fn parse_har_method(method: &str) -> HttpMethod {
    match method.to_uppercase().as_str() {
        "GET" => HttpMethod::GET,
        "POST" => HttpMethod::POST,
        "PUT" => HttpMethod::PUT,
        "PATCH" => HttpMethod::PATCH,
        "DELETE" => HttpMethod::DELETE,
        "HEAD" => HttpMethod::HEAD,
        "OPTIONS" => HttpMethod::OPTIONS,
        "TRACE" => HttpMethod::TRACE,
        _ => HttpMethod::GET,
    }
}
