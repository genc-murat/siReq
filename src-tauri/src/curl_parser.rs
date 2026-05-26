use crate::models::*;
use nom::{
    bytes::complete::{tag, take_till, take_till1},
    character::complete::{char, multispace0},
    sequence::{delimited, preceded, tuple},
    IResult,
};

fn parse_quoted_string(input: &str) -> IResult<&str, &str> {
    delimited(char('\''), take_till(|c| c == '\''), char('\''))(input)
}

fn parse_double_quoted_string(input: &str) -> IResult<&str, &str> {
    delimited(char('"'), take_till(|c| c == '"'), char('"'))(input)
}

fn parse_string_arg(input: &str) -> IResult<&str, &str> {
    let (input, _) = multispace0(input)?;
    if input.starts_with('\'') {
        parse_quoted_string(input)
    } else if input.starts_with('"') {
        parse_double_quoted_string(input)
    } else {
        take_till1(|c: char| c.is_whitespace())(input)
    }
}

fn parse_flag<'a>(flag: &'static str) -> impl Fn(&'a str) -> IResult<&'a str, &'a str> {
    move |input: &'a str| {
        preceded(tuple((multispace0, tag(flag))), parse_string_arg)(input)
    }
}

pub fn parse_curl(input: &str) -> Result<HttpRequest, String> {
    let input = input.trim();

    let (rest, _) = tuple::<_, _, nom::error::Error<&str>, _>((
        tag("curl"),
        multispace0,
    ))(input).map_err(|e| format!("Not a cURL command: {:?}", e))?;

    let mut method: Option<HttpMethod> = None;
    let mut url: Option<String> = None;
    let mut headers: Vec<KeyValue> = vec![];
    let mut body: Option<String> = None;

    let mut remaining = rest;

    while !remaining.trim().is_empty() {
        remaining = remaining.trim();

        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("--compressed")(remaining) {
            remaining = r;
            continue;
        }

        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("-s")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("--silent")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("-S")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("-v")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("--verbose")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("-L")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("--location")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("-k")(remaining) {
            remaining = r;
            continue;
        }
        if let Ok((r, _)) = tag::<_, _, nom::error::Error<&str>>("--insecure")(remaining) {
            remaining = r;
            continue;
        }

        if let Ok((r, m)) = parse_flag("-X")(remaining) {
            method = Some(match m {
                "GET" => HttpMethod::GET,
                "POST" => HttpMethod::POST,
                "PUT" => HttpMethod::PUT,
                "PATCH" => HttpMethod::PATCH,
                "DELETE" => HttpMethod::DELETE,
                "HEAD" => HttpMethod::HEAD,
                "OPTIONS" => HttpMethod::OPTIONS,
                "TRACE" => HttpMethod::TRACE,
                _ => HttpMethod::GET,
            });
            remaining = r;
            continue;
        }
        if let Ok((r, m)) = parse_flag("--request")(remaining) {
            method = Some(match m {
                "GET" => HttpMethod::GET,
                "POST" => HttpMethod::POST,
                "PUT" => HttpMethod::PUT,
                "PATCH" => HttpMethod::PATCH,
                "DELETE" => HttpMethod::DELETE,
                "HEAD" => HttpMethod::HEAD,
                "OPTIONS" => HttpMethod::OPTIONS,
                "TRACE" => HttpMethod::TRACE,
                _ => HttpMethod::GET,
            });
            remaining = r;
            continue;
        }

        if let Ok((r, header_val)) = parse_flag("-H")(remaining) {
            if let Some((k, v)) = header_val.split_once(':') {
                headers.push(KeyValue {
                    key: k.trim().to_string(),
                    value: v.trim().to_string(),
                    enabled: true,
                    is_secret: false,
                });
            }
            remaining = r;
            continue;
        }
        if let Ok((r, header_val)) = parse_flag("--header")(remaining) {
            if let Some((k, v)) = header_val.split_once(':') {
                headers.push(KeyValue {
                    key: k.trim().to_string(),
                    value: v.trim().to_string(),
                    enabled: true,
                    is_secret: false,
                });
            }
            remaining = r;
            continue;
        }

        if let Ok((r, data)) = parse_flag("-d")(remaining) {
            body = Some(data.to_string());
            if method.is_none() {
                method = Some(HttpMethod::POST);
            }
            remaining = r;
            continue;
        }
        if let Ok((r, data)) = parse_flag("--data")(remaining) {
            body = Some(data.to_string());
            if method.is_none() {
                method = Some(HttpMethod::POST);
            }
            remaining = r;
            continue;
        }
        if let Ok((r, data)) = parse_flag("--data-raw")(remaining) {
            body = Some(data.to_string());
            if method.is_none() {
                method = Some(HttpMethod::POST);
            }
            remaining = r;
            continue;
        }
        if let Ok((r, data)) = parse_flag("--data-binary")(remaining) {
            body = Some(data.to_string());
            if method.is_none() {
                method = Some(HttpMethod::POST);
            }
            remaining = r;
            continue;
        }

        if remaining.starts_with('\'') || remaining.starts_with('"') || (!remaining.starts_with('-')) {
            let (r, url_str) = parse_string_arg(remaining).map_err(|e| format!("Parse error: {:?}", e))?;
            url = Some(url_str.to_string());
            remaining = r;
            continue;
        }

        let (r, _) = take_till1::<_, _, nom::error::Error<&str>>(|c: char| c.is_whitespace())(remaining).unwrap_or((remaining.trim_start(), ""));
        remaining = r.trim();
        if remaining == r.trim() {
            break;
        }
    }

    let final_url = url.ok_or("No URL found in cURL command")?;
    let final_method = method.unwrap_or(HttpMethod::GET);
    let body_type = if body.is_some() {
        let ct = headers.iter().find(|h| h.key.eq_ignore_ascii_case("content-type"));
        if let Some(ct) = ct {
            if ct.value.contains("json") {
                BodyType::json
            } else if ct.value.contains("xml") {
                BodyType::xml
            } else if ct.value.contains("x-www-form-urlencoded") {
                BodyType::form_urlencoded
            } else if ct.value.contains("form-data") || ct.value.contains("multipart") {
                BodyType::form
            } else {
                BodyType::text
            }
        } else {
            BodyType::text
        }
    } else {
        BodyType::none
    };

    let request_url = final_url;

    let method_str = match &final_method {
        HttpMethod::GET => "GET",
        HttpMethod::POST => "POST",
        HttpMethod::PUT => "PUT",
        HttpMethod::PATCH => "PATCH",
        HttpMethod::DELETE => "DELETE",
        HttpMethod::HEAD => "HEAD",
        HttpMethod::OPTIONS => "OPTIONS",
        HttpMethod::TRACE => "TRACE",
    };

    Ok(HttpRequest {
        id: uuid::Uuid::new_v4().to_string(),
        name: format!("{} {}", method_str, request_url),
        method: final_method,
        url: request_url,
        headers,
        query_params: vec![],
        body_type,
        body: body.unwrap_or_default(),
        form_fields: vec![],
        auth: AuthConfig {
            auth_type: AuthType::none,
            username: String::new(),
            password: String::new(),
            token: String::new(),
            api_key: String::new(),
            api_key_name: String::new(),
            api_key_in: "header".to_string(),
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
    })
}
