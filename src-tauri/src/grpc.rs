use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use http_body_util::BodyExt;
use hyper::client::conn::http2;
use hyper_util::rt::TokioExecutor;
use hyper_util::rt::TokioIo;
use prost::Message;
use prost_reflect::{DynamicMessage, DescriptorPool, MethodDescriptor, FieldDescriptor};
use protox::compile;
use sha2::{Sha256, Digest};

use crate::models::*;

/// Managed state for caching parsed proto descriptor pools.
pub struct GrpcState(pub Arc<Mutex<HashMap<String, DescriptorPool>>>);

/// Parse raw .proto content at runtime and return a descriptor set.
/// Results are cached by SHA-256 content hash — re-parsing the same proto
/// content is instant (skips protox compilation entirely).
pub fn parse_proto(content: &str, state: &GrpcState) -> Result<GrpcDescriptorSet, String> {
    // Compute content hash for caching
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let content_hash = format!("proto:{:x}", hasher.finalize());

    // Lock once for the cache check + possible insert
    let mut map = state.0.lock().map_err(|e| e.to_string())?;

    // Check cache: reuse previously compiled pool if content is identical
    let is_cache_hit = map.contains_key(&content_hash);

    if !is_cache_hit {
        // Not in cache — compile from scratch
        drop(map);

        let tmp_dir = std::env::temp_dir();
        let file_name = format!("sireq_{}.proto", uuid::Uuid::new_v4());
        let tmp_path = tmp_dir.join(&file_name);
        std::fs::write(&tmp_path, content)
            .map_err(|e| format!("Failed to write temp proto file: {}", e))?;

        let fd_set = compile([file_name.as_str()], [tmp_dir.to_str().unwrap()])
            .map_err(|e| format!("Proto compilation failed: {}", e))?;

        let _ = std::fs::remove_file(&tmp_path);

        let pool = DescriptorPool::from_file_descriptor_set(fd_set)
            .map_err(|e| format!("Failed to build descriptor pool: {}", e))?;

        // Store under content hash for future cache hits
        map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(content_hash.clone(), pool);
    }

    let pool = map.get(&content_hash)
        .ok_or_else(|| "Cache inconsistency: pool vanished".to_string())?
        .clone();

    // Always generate a fresh UUID so each parse call gets a unique proto_id
    let id = uuid::Uuid::new_v4().to_string();
    map.insert(id.clone(), pool.clone());
    drop(map);

    // Build services from the pool (fast — no protox compilation)
    let services: Vec<GrpcServiceInfo> = pool.services()
        .map(|s| {
            let methods: Vec<GrpcMethodInfo> = s.methods()
                .map(|m| {
                    GrpcMethodInfo {
                        name: m.name().to_string(),
                        full_name: m.full_name().to_string(),
                        input_type: m.input().full_name().to_string(),
                        output_type: m.output().full_name().to_string(),
                        client_streaming: m.is_client_streaming(),
                        server_streaming: m.is_server_streaming(),
                        input_fields: get_message_fields(m.input()),
                        output_fields: get_message_fields(m.output()),
                    }
                })
                .collect();

            GrpcServiceInfo {
                name: s.name().to_string(),
                full_name: s.full_name().to_string(),
                methods,
            }
        })
        .collect();

    Ok(GrpcDescriptorSet { proto_id: id, services, from_cache: is_cache_hit })
}

fn get_field_type_name(field: &FieldDescriptor) -> String {
    use prost_reflect::Kind;
    match field.kind() {
        Kind::Double => "double",
        Kind::Float => "float",
        Kind::Int32 | Kind::Sint32 | Kind::Sfixed32 => "int32",
        Kind::Int64 | Kind::Sint64 | Kind::Sfixed64 => "int64",
        Kind::Uint32 | Kind::Fixed32 => "uint32",
        Kind::Uint64 | Kind::Fixed64 => "uint64",
        Kind::Bool => "bool",
        Kind::String => "string",
        Kind::Bytes => "bytes",
        Kind::Message(m) => return m.full_name().to_string(),
        Kind::Enum(e) => return e.full_name().to_string(),
    }
    .to_string()
}

fn get_field_label(field: &FieldDescriptor) -> String {
    use prost_reflect::Cardinality;
    match field.cardinality() {
        Cardinality::Optional => "optional",
        Cardinality::Required => "required",
        Cardinality::Repeated => "repeated",
    }
    .to_string()
}

/// Recursively resolve message fields with cycle detection.
/// Skips well-known google.protobuf types (handled by JSON mapping).
fn get_message_fields_recurse(
    desc: prost_reflect::MessageDescriptor,
    visited: &mut std::collections::HashSet<String>,
) -> Vec<GrpcFieldInfo> {
    let name = desc.full_name().to_string();

    // Skip well-known types — they're handled via prost-reflect's JSON mapping
    if name.starts_with("google.protobuf.") {
        return vec![];
    }

    // Cycle detection: if we've seen this message type before, stop recursion
    if !visited.insert(name) {
        return vec![];
    }

    desc.fields()
        .map(|f| {
            use prost_reflect::Kind;
            let (sub_fields, enum_values) = match f.kind() {
                Kind::Message(m) => {
                    (get_message_fields_recurse(m, visited), vec![])
                }
                Kind::Enum(e) => {
                    let values: Vec<String> = e.values().map(|v| v.name().to_string()).collect();
                    (vec![], values)
                }
                _ => (vec![], vec![]),
            };

            GrpcFieldInfo {
                name: f.name().to_string(),
                field_type: get_field_type_name(&f),
                label: get_field_label(&f),
                is_map: f.is_map(),
                sub_fields,
                enum_values,
            }
        })
        .collect()
}

fn get_message_fields(desc: prost_reflect::MessageDescriptor) -> Vec<GrpcFieldInfo> {
    let mut visited = std::collections::HashSet::new();
    get_message_fields_recurse(desc, &mut visited)
}

fn get_method(
    pool: &DescriptorPool,
    service_name: &str,
    method_name: &str,
) -> Result<MethodDescriptor, String> {
    let service = pool.get_service_by_name(service_name)
        .ok_or_else(|| format!("Service '{}' not found", service_name))?;

    let methods: Vec<MethodDescriptor> = service.methods().collect();
    methods.into_iter()
        .find(|m| m.name() == method_name)
        .ok_or_else(|| format!("Method '{}.{}' not found", service_name, method_name))
}

/// Build a gRPC frame: [0x00 (uncompressed)] + [4-byte big-endian length] + [message bytes]
fn build_grpc_frame(message_bytes: &[u8]) -> Vec<u8> {
    let len = message_bytes.len() as u32;
    let mut frame = Vec::with_capacity(5 + message_bytes.len());
    frame.push(0u8);
    frame.extend_from_slice(&len.to_be_bytes());
    frame.extend_from_slice(message_bytes);
    frame
}

/// Parse a gRPC frame from response data. Returns (message_bytes, remaining_data).
fn parse_grpc_frame(data: &[u8]) -> Result<(Vec<u8>, &[u8]), String> {
    if data.len() < 5 {
        return Err(format!("Truncated gRPC response (need 5 bytes, got {})", data.len()));
    }
    let length = u32::from_be_bytes([data[1], data[2], data[3], data[4]]) as usize;
    let end = 5 + length;
    if end > data.len() {
        return Err(format!("Truncated gRPC frame: expected {} bytes, got {}", length, data.len() - 5));
    }
    let message = data[5..end].to_vec();
    Ok((message, &data[end..]))
}

// Helper trait to unify TcpStream and TlsStream in a single trait object
use tokio::io::{AsyncRead, AsyncWrite};

trait IoReadWrite: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> IoReadWrite for T {}

/// Connect to a gRPC server via HTTP/2 and send a request.
/// Uses hyper directly for full HTTP/2 trailer support.
/// Supports both plaintext (h2c) and TLS (h2) connections.
async fn send_grpc_request(
    address: &str,
    tls: bool,
    path: &str,
    frame_bytes: Vec<u8>,
) -> Result<(http::StatusCode, Vec<(String, String)>, Vec<u8>), String> {
    // Clone address to owned so ServerName can borrow safely in the TLS branch
    let address = address.to_owned();

    // Address must include port
    let addr = if address.contains(':') {
        &*address
    } else {
        return Err(format!("Address must include port (e.g., localhost:8080), got: {}", address));
    };

    // Connect via TCP
    let stream = tokio::net::TcpStream::connect(addr)
        .await
        .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

    // If TLS is requested, wrap the TCP stream with TLS before HTTP/2 handshake
    // Use Pin<Box<dyn IoReadWrite>> so both branches produce the same type for TokioIo
    use std::pin::Pin;

    let io: TokioIo<Pin<Box<dyn IoReadWrite>>> = if tls {
        use std::sync::Arc;
        use rustls::pki_types::ServerName;
        use tokio_rustls::TlsConnector;

        let domain_owned = address.split(':').next()
            .ok_or_else(|| "Invalid address: cannot extract hostname".to_string())?
            .to_owned();

        // Leak to get &'static str — tokio-rustls requires ServerName<'static>
        let domain: &'static str = Box::leak(domain_owned.into_boxed_str());

        let server_name = if let Ok(ip) = domain.parse::<std::net::IpAddr>() {
            ServerName::IpAddress(rustls::pki_types::IpAddr::from(ip))
        } else {
            ServerName::try_from(domain)
                .map_err(|e| format!("Invalid domain name '{}': {}", domain, e))?
        };

        let mut root_store = rustls::RootCertStore::empty();

        // load_native_certs() returns CertificateResult { certs, errors } — not a Result
        let native_certs = rustls_native_certs::load_native_certs();
        for cert in native_certs.certs {
            // Ignore individual cert errors silently (cert may just be expired/malformed)
            let _ = root_store.add(cert);
        }

        let config = rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth();

        let connector = TlsConnector::from(Arc::new(config));
        let tls_stream = connector
            .connect(server_name, stream)
            .await
            .map_err(|e| format!("TLS handshake failed: {}", e))?;

        TokioIo::new(Box::pin(tls_stream))
    } else {
        TokioIo::new(Box::pin(stream))
    };

    // Perform HTTP/2 handshake (prior knowledge = no upgrade, no TLS)
    let (mut send_request, connection) = http2::Builder::new(TokioExecutor::new())
        .handshake::<_, http_body_util::Full<hyper::body::Bytes>>(io)
        .await
        .map_err(|e| format!("HTTP/2 handshake failed: {}", e))?;

    // Spawn the connection handler
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            log::warn!("HTTP/2 connection error: {:?}", e);
        }
    });

    // Build the request
    let req = http::Request::post(path)
        .header("content-type", "application/grpc")
        .header("te", "trailers")
        .body(http_body_util::Full::new(hyper::body::Bytes::from(frame_bytes)))
        .map_err(|e| format!("Failed to build request: {}", e))?;

    // Send and receive
    let response = send_request.send_request(req).await
        .map_err(|e| format!("gRPC request failed: {}", e))?;

    let http_status = response.status();
    let headers: Vec<(String, String)> = response.headers().iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    // Collect body + trailers using http_body_util
    let (_, body) = response.into_parts();
    let collected = BodyExt::collect(body).await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // Extract trailers BEFORE calling to_bytes() (which moves collected)
    let trailers: Vec<(String, String)> = collected.trailers()
        .map(|trailer_map| {
            trailer_map.iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let body_bytes = collected.to_bytes().to_vec();

    // Merge trailers into headers — trailer values take precedence
    let mut all_headers = headers;
    for (k, v) in trailers {
        all_headers.retain(|(ek, _)| !ek.eq_ignore_ascii_case(&k));
        all_headers.push((k, v));
    }

    Ok((http_status, all_headers, body_bytes))
}

/// Decode protobuf message bytes into a pretty-printed JSON string.
fn decode_message_to_json(msg_bytes: &[u8], output_desc: &prost_reflect::MessageDescriptor) -> Result<String, String> {
    if msg_bytes.is_empty() {
        return Ok(String::new());
    }
    let output = DynamicMessage::decode(output_desc.clone(), msg_bytes)
        .map_err(|e| format!("Failed to decode response: {}", e))?;

    // DynamicMessage implements Serialize, so we can use serde_json
    let json_value = serde_json::to_value(&output)
        .map_err(|e| format!("Failed to serialize response: {}", e))?;

    serde_json::to_string_pretty(&json_value)
        .map_err(|e| format!("Failed to format JSON: {}", e))
}

/// Extract gRPC status/message from response headers.
fn extract_grpc_status(headers: &[(String, String)]) -> (String, String) {
    // Use rfind() so trailer values (appended last) override header values
    let status = headers.iter()
        .rfind(|(k, _)| k.eq_ignore_ascii_case("grpc-status"))
        .map(|(_, v)| v.clone())
        .unwrap_or_else(|| "0".to_string());

    let message = headers.iter()
        .rfind(|(k, _)| k.eq_ignore_ascii_case("grpc-message"))
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    (status, message)
}

/// Make a bidirectional streaming gRPC call — sends multiple messages, receives streaming responses.
pub async fn call_bidi_streaming(
    address: &str,
    tls: bool,
    descriptor_pool: &DescriptorPool,
    service_name: &str,
    method_name: &str,
    input_jsons: Vec<String>,
    max_messages: usize,
) -> Result<Vec<GrpcResponse>, String> {
    let method = get_method(descriptor_pool, service_name, method_name)?;
    let path = format!("/{}", method.full_name());

    if input_jsons.is_empty() {
        return Err("At least one input message is required for bidirectional streaming".to_string());
    }

    // Encode each input JSON into a gRPC frame and concatenate
    let mut body_bytes: Vec<u8> = Vec::new();
    for input_json in &input_jsons {
        let input_value: serde_json::Value = serde_json::from_str(input_json)
            .map_err(|e| format!("Invalid input JSON: {}", e))?;

        let dynamic_input = DynamicMessage::deserialize(method.input(), input_value)
            .map_err(|e| format!("Failed to deserialize input: {}", e))?;

        let mut msg_bytes: Vec<u8> = Vec::new();
        Message::encode(&dynamic_input, &mut msg_bytes)
            .map_err(|e| format!("Failed to encode input: {}", e))?;

        body_bytes.extend_from_slice(&build_grpc_frame(&msg_bytes));
    }

    let start = std::time::Instant::now();
    let (http_status, req_headers, response_body) = send_grpc_request(address, tls, &path, body_bytes).await?;

    if http_status != 200 && http_status.as_u16() != 0 {
        return Err(format!("gRPC call failed with HTTP status {}", http_status));
    }

    let (grpc_status, grpc_message) = extract_grpc_status(&req_headers);

    if grpc_status != "0" && !grpc_status.is_empty() {
        return Ok(vec![GrpcResponse {
            status_code: grpc_status.clone(),
            status_message: grpc_message.clone(),
            headers: req_headers,
            body: String::new(),
            size: 0,
            time_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("gRPC error {}: {}", grpc_status, grpc_message)),
        }]);
    }

    // Parse streaming frames from response body (like server-streaming)
    let mut responses: Vec<GrpcResponse> = Vec::new();
    let mut data = &response_body[..];
    let mut message_count = 0;
    let output_desc = method.output();

    while !data.is_empty() {
        match parse_grpc_frame(data) {
            Ok((msg_bytes, rest)) => {
                message_count += 1;
                let msg_size = msg_bytes.len() as u64;
                let response_json = decode_message_to_json(&msg_bytes, &output_desc).unwrap_or_default();

                responses.push(GrpcResponse {
                    status_code: grpc_status.clone(),
                    status_message: grpc_message.clone(),
                    headers: req_headers.clone(),
                    body: response_json,
                    size: msg_size,
                    time_ms: start.elapsed().as_millis() as u64,
                    error: None,
                });

                data = rest;

                if max_messages > 0 && message_count >= max_messages {
                    break;
                }
            }
            Err(_) => {
                if responses.is_empty() {
                    responses.push(GrpcResponse {
                        status_code: grpc_status.clone(),
                        status_message: grpc_message.clone(),
                        headers: req_headers.clone(),
                        body: String::from_utf8_lossy(data).to_string(),
                        size: data.len() as u64,
                        time_ms: start.elapsed().as_millis() as u64,
                        error: Some("Could not parse gRPC frames".to_string()),
                    });
                }
                break;
            }
        }
    }

    if responses.is_empty() {
        responses.push(GrpcResponse {
            status_code: grpc_status,
            status_message: grpc_message,
            headers: req_headers,
            body: String::new(),
            size: 0,
            time_ms: start.elapsed().as_millis() as u64,
            error: None,
        });
    }

    Ok(responses)
}

/// Make a client-streaming gRPC call — sends multiple messages, receives one response.
pub async fn call_client_streaming(
    address: &str,
    tls: bool,
    descriptor_pool: &DescriptorPool,
    service_name: &str,
    method_name: &str,
    input_jsons: Vec<String>,
) -> Result<GrpcResponse, String> {
    let method = get_method(descriptor_pool, service_name, method_name)?;
    let path = format!("/{}", method.full_name());

    if input_jsons.is_empty() {
        return Err("At least one input message is required for client-streaming".to_string());
    }

    // Encode each input JSON into a gRPC frame and concatenate
    let mut body_bytes: Vec<u8> = Vec::new();
    for input_json in &input_jsons {
        let input_value: serde_json::Value = serde_json::from_str(input_json)
            .map_err(|e| format!("Invalid input JSON: {}", e))?;

        let dynamic_input = DynamicMessage::deserialize(method.input(), input_value)
            .map_err(|e| format!("Failed to deserialize input: {}", e))?;

        let mut msg_bytes: Vec<u8> = Vec::new();
        Message::encode(&dynamic_input, &mut msg_bytes)
            .map_err(|e| format!("Failed to encode input: {}", e))?;

        body_bytes.extend_from_slice(&build_grpc_frame(&msg_bytes));
    }

    let start = std::time::Instant::now();
    let (_, resp_headers, response_body) = send_grpc_request(address, tls, &path, body_bytes).await?;
    let elapsed = start.elapsed().as_millis() as u64;

    let (grpc_status, grpc_message) = extract_grpc_status(&resp_headers);

    // Decode single response body
    let response_json = if grpc_status == "0" || grpc_status.is_empty() {
        if response_body.len() >= 5 {
            match parse_grpc_frame(&response_body) {
                Ok((msg_bytes, _rest)) => {
                    decode_message_to_json(&msg_bytes, &method.output()).unwrap_or_default()
                }
                Err(_) => String::from_utf8_lossy(&response_body).to_string(),
            }
        } else if !response_body.is_empty() {
            String::from_utf8_lossy(&response_body).to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    Ok(GrpcResponse {
        status_code: grpc_status.clone(),
        status_message: grpc_message.clone(),
        headers: resp_headers,
        body: response_json,
        size: response_body.len() as u64,
        time_ms: elapsed,            error: if grpc_status != "0" && !grpc_status.is_empty() {
            Some(format!("gRPC error {}: {}", grpc_status, grpc_message))
        } else {
            None
        },
    })
}

/// Make a unary gRPC call.
pub async fn call_unary(
    address: &str,
    tls: bool,
    descriptor_pool: &DescriptorPool,
    service_name: &str,
    method_name: &str,
    input_json: &str,
) -> Result<GrpcResponse, String> {
    let method = get_method(descriptor_pool, service_name, method_name)?;
    let path = format!("/{}", method.full_name());

    // Parse input JSON into DynamicMessage
    let input_value: serde_json::Value = serde_json::from_str(input_json)
        .map_err(|e| format!("Invalid input JSON: {}", e))?;

    let dynamic_input = DynamicMessage::deserialize(method.input(), input_value)
        .map_err(|e| format!("Failed to deserialize input: {}", e))?;

    // Encode to bytes using prost::Message trait
    let mut body_bytes: Vec<u8> = Vec::new();
    Message::encode(&dynamic_input, &mut body_bytes)
        .map_err(|e| format!("Failed to encode input: {}", e))?;
    let frame = build_grpc_frame(&body_bytes);

    let start = std::time::Instant::now();
    let (_, resp_headers, response_body) = send_grpc_request(address, tls, &path, frame).await?;
    let elapsed = start.elapsed().as_millis() as u64;

    let (grpc_status, grpc_message) = extract_grpc_status(&resp_headers);

    // Decode response body
    let response_json = if grpc_status == "0" || grpc_status.is_empty() {
        if response_body.len() >= 5 {
            match parse_grpc_frame(&response_body) {
                Ok((msg_bytes, _rest)) => {
                    decode_message_to_json(&msg_bytes, &method.output()).unwrap_or_default()
                }
                Err(_) => String::from_utf8_lossy(&response_body).to_string(),
            }
        } else if !response_body.is_empty() {
            String::from_utf8_lossy(&response_body).to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    Ok(GrpcResponse {
        status_code: grpc_status.clone(),
        status_message: grpc_message.clone(),
        headers: resp_headers,
        body: response_json,
        size: response_body.len() as u64,
        time_ms: elapsed,            error: if grpc_status != "0" && !grpc_status.is_empty() {
            Some(format!("gRPC error {}: {}", grpc_status, grpc_message))
        } else {
            None
        },
    })
}

/// Make a server-streaming gRPC call and return all messages as vector.
pub async fn call_server_streaming(
    address: &str,
    tls: bool,
    descriptor_pool: &DescriptorPool,
    service_name: &str,
    method_name: &str,
    input_json: &str,
    max_messages: usize,
) -> Result<Vec<GrpcResponse>, String> {
    let method = get_method(descriptor_pool, service_name, method_name)?;
    let path = format!("/{}", method.full_name());

    // Parse input
    let input_value: serde_json::Value = serde_json::from_str(input_json)
        .map_err(|e| format!("Invalid input JSON: {}", e))?;

    let dynamic_input = DynamicMessage::deserialize(method.input(), input_value)
        .map_err(|e| format!("Failed to deserialize input: {}", e))?;

    let mut body_bytes: Vec<u8> = Vec::new();
    prost::Message::encode(&dynamic_input, &mut body_bytes)
        .map_err(|e| format!("Failed to encode input: {}", e))?;
    let frame = build_grpc_frame(&body_bytes);

    let start = std::time::Instant::now();
    let (http_status, req_headers, response_body) = send_grpc_request(address, tls, &path, frame).await?;

    if http_status != 200 && http_status.as_u16() != 0 {
        return Err(format!("gRPC call failed with HTTP status {}", http_status));
    }

    let (grpc_status, grpc_message) = extract_grpc_status(&req_headers);

    // Parse streaming frames from response body
    let mut responses: Vec<GrpcResponse> = Vec::new();
    let mut data = &response_body[..];
    let mut message_count = 0;
    let output_desc = method.output();

    while !data.is_empty() {
        match parse_grpc_frame(data) {
            Ok((msg_bytes, rest)) => {
                message_count += 1;
                let msg_size = msg_bytes.len() as u64;
                let response_json = decode_message_to_json(&msg_bytes, &output_desc).unwrap_or_default();

                responses.push(GrpcResponse {
                    status_code: grpc_status.clone(),
                    status_message: grpc_message.clone(),
                    headers: req_headers.clone(),
                    body: response_json,
                    size: msg_size,
                    time_ms: start.elapsed().as_millis() as u64,
                    error: None,
                });

                data = rest;

                if max_messages > 0 && message_count >= max_messages {
                    break;
                }
            }
            Err(_) => {
                if responses.is_empty() {
                    responses.push(GrpcResponse {
                        status_code: grpc_status.clone(),
                        status_message: grpc_message.clone(),
                        headers: req_headers.clone(),
                        body: String::from_utf8_lossy(data).to_string(),
                        size: data.len() as u64,
                        time_ms: start.elapsed().as_millis() as u64,
                        error: Some("Could not parse gRPC frames".to_string()),
                    });
                }
                break;
            }
        }
    }

    if responses.is_empty() {
        responses.push(GrpcResponse {
            status_code: grpc_status,
            status_message: grpc_message,
            headers: req_headers,
            body: String::new(),
            size: 0,
            time_ms: start.elapsed().as_millis() as u64,
            error: None,
        });
    }

    Ok(responses)
}

/// Get a descriptor pool by proto_id from state.
pub fn get_pool(state: &GrpcState, proto_id: &str) -> Result<DescriptorPool, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    map.get(proto_id)
        .cloned()
        .ok_or_else(|| format!("Proto descriptor '{}' not found. Re-parse the proto file.", proto_id))
}

// ─── gRPC Reflection (v1alpha) ─────────────────────────────────────────

/// The gRPC Server Reflection protocol definition (v1alpha).
const REFLECTION_PROTO: &str = r#"
syntax = "proto3";
package grpc.reflection.v1alpha;

service ServerReflection {
  rpc ServerReflectionInfo(stream ServerReflectionRequest) returns (stream ServerReflectionResponse);
}

message ServerReflectionRequest {
  string host = 1;
  oneof message_request {
    string file_by_filename = 3;
    string file_containing_symbol = 4;
    ExtensionRequest file_containing_extension = 5;
    string all_extension_numbers_of_type = 6;
    string list_services = 7;
  }
}

message ExtensionRequest {
  string containing_type = 1;
  int32 extension_number = 2;
}

message ServerReflectionResponse {
  string valid_host = 1;
  ServerReflectionRequest original_request = 2;
  oneof message_response {
    FileDescriptorResponse file_descriptor_response = 4;
    ExtensionNumberResponse all_extension_numbers_response = 5;
    ListServiceResponse list_services_response = 6;
    ErrorResponse error_response = 7;
  }
}

message FileDescriptorResponse {
  repeated bytes file_descriptor_proto = 1;
}

message ExtensionNumberResponse {
  string base_type_name = 1;
  repeated int32 extension_number = 2;
}

message ListServiceResponse {
  repeated ServiceResponse service = 1;
}

message ServiceResponse {
  string name = 1;
}

message ErrorResponse {
  int32 error_code = 1;
  string error_message = 2;
}
"#;

/// Compile and cache the reflection descriptor pool (lazily, once).
fn get_reflection_pool() -> Result<&'static DescriptorPool, String> {
    use std::sync::OnceLock;
    static POOL: OnceLock<Result<DescriptorPool, String>> = OnceLock::new();

    POOL.get_or_init(|| {
        let tmp_dir = std::env::temp_dir();
        let tmp_path = tmp_dir.join("sireq_reflection.proto");
        std::fs::write(&tmp_path, REFLECTION_PROTO)
            .map_err(|e| format!("Failed to write reflection proto: {}", e))?;
        let result = compile(["sireq_reflection.proto"], [tmp_dir.to_str().unwrap()])
            .map_err(|e| format!("Failed to compile reflection proto: {}", e));
        let _ = std::fs::remove_file(&tmp_path);
        let fd_set = result?;
        DescriptorPool::from_file_descriptor_set(fd_set)
            .map_err(|e| format!("Failed to build reflection descriptor pool: {}", e))
    }).as_ref().map_err(|e| e.clone())
}

/// Build and send a reflection request, returning the parsed response.
async fn send_reflection_request(
    address: &str,
    tls: bool,
    request_type: &str,
    request_value: &str,
) -> Result<serde_json::Value, String> {
    let pool = get_reflection_pool()?;

    let msg_desc = pool.get_message_by_name("grpc.reflection.v1alpha.ServerReflectionRequest")
        .ok_or_else(|| "Reflection proto: grpc.reflection.v1alpha.ServerReflectionRequest not found".to_string())?;

    // Build the request JSON (prost-reflect uses camelCase for serde by default)
    let request_json = match request_type {
        "list_services" => serde_json::json!({
            "host": "",
            "listServices": request_value
        }),
        "file_containing_symbol" => serde_json::json!({
            "host": "",
            "fileContainingSymbol": request_value
        }),
        "file_by_filename" => serde_json::json!({
            "host": "",
            "fileByFilename": request_value
        }),
        _ => return Err(format!("Unknown reflection request type: {}", request_type)),
    };

    let dynamic = DynamicMessage::deserialize(msg_desc, request_json)
        .map_err(|e| format!("Failed to deserialize reflection request: {}", e))?;

    let mut buf = Vec::new();
    Message::encode(&dynamic, &mut buf)
        .map_err(|e| format!("Failed to encode reflection request: {}", e))?;
    let frame = build_grpc_frame(&buf);

    let path = "/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo";
    let start = std::time::Instant::now();
    let (_, headers, response_body) = send_grpc_request(address, tls, path, frame).await?;
    let _elapsed = start.elapsed().as_millis() as u64;

    let (grpc_status, grpc_message) = extract_grpc_status(&headers);
    if grpc_status != "0" && !grpc_status.is_empty() {
        return Err(format!("Reflection server returned error: {} ({})", grpc_status, grpc_message));
    }

    if response_body.len() < 5 {
        return Err("Empty or truncated reflection response".to_string());
    }

    let (msg_bytes, _) = parse_grpc_frame(&response_body)?;

    let resp_desc = pool.get_message_by_name("grpc.reflection.v1alpha.ServerReflectionResponse")
        .ok_or_else(|| "Reflection proto: grpc.reflection.v1alpha.ServerReflectionResponse not found".to_string())?;

    let dynamic_resp = DynamicMessage::decode(resp_desc.clone(), msg_bytes.as_slice())
        .map_err(|e| format!("Failed to decode reflection response: {}", e))?;

    serde_json::to_value(&dynamic_resp)
        .map_err(|e| format!("Failed to serialize reflection response: {}", e))
}

/// Discover services on a gRPC server via reflection.
pub async fn reflect_list_services(
    address: &str,
    tls: bool,
) -> Result<Vec<String>, String> {
    let response = send_reflection_request(address, tls, "list_services", "").await?;

    // Navigate the response JSON to extract service names
    // Structure: { "list_services_response": { "service": [{ "name": "svc1" }, ...] } }
    // prost-reflect serializes JSON with camelCase field names
    let services = response.get("listServicesResponse")
        .and_then(|lsr| lsr.get("service"))
        .and_then(|services| services.as_array())
        .ok_or_else(|| format!("Unexpected reflection response format: {}", response))?;

    let names: Vec<String> = services.iter()
        .filter_map(|s| s.get("name").and_then(|n| n.as_str()).map(|n| n.to_string()))
        .collect();
    if names.is_empty() && !services.is_empty() {
        return Err(format!("Reflection returned services but could not parse names: {}", response));
    }

    Ok(names)
}

/// Fetch the full proto descriptor for a symbol (service name) via reflection.
pub async fn reflect_get_proto(
    address: &str,
    tls: bool,
    symbol: &str,
    state: &GrpcState,
) -> Result<GrpcDescriptorSet, String> {
    let response = send_reflection_request(address, tls, "file_containing_symbol", symbol).await?;

    // Check for error response (prost-reflect uses camelCase JSON)
    if let Some(error) = response.get("errorResponse") {
        let code = error.get("errorCode").and_then(|c| c.as_i64()).unwrap_or(-1);
        let msg = error.get("errorMessage").and_then(|m| m.as_str()).unwrap_or("unknown");
        return Err(format!("Reflection error {}: {}", code, msg));
    }

    // Extract file_descriptor_proto bytes from response
    // Structure: { "file_descriptor_response": { "file_descriptor_proto": ["base64...", ...] } }
    let fdr = response.get("fileDescriptorResponse")
        .ok_or_else(|| format!("Reflection response missing file_descriptor_response: {}", response))?;

    let fd_protos = fdr.get("fileDescriptorProto")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "file_descriptor_proto is not an array".to_string())?;

    if fd_protos.is_empty() {
        return Err(format!("No file descriptors returned for symbol '{}'", symbol));
    }

    // Decode each file descriptor proto from base64 (JSON format from serde)
    use prost::Message as ProstMessage;
    use base64::Engine;
    let base64_engine = base64::engine::general_purpose::STANDARD;

    let mut file_descriptors = Vec::new();
    for val in fd_protos {
        let b64_str = val.as_str()
            .ok_or_else(|| "file_descriptor_proto entry is not a string".to_string())?;
        let raw_bytes = base64_engine.decode(b64_str)
            .map_err(|e| format!("Failed to decode base64 file descriptor: {}", e))?;
        let fdp = prost_reflect::prost_types::FileDescriptorProto::decode(raw_bytes.as_slice())
            .map_err(|e| format!("Failed to decode FileDescriptorProto: {}", e))?;
        file_descriptors.push(fdp);
    }

    // Build a FileDescriptorSet and create a DescriptorPool
    let fd_set = prost_reflect::prost_types::FileDescriptorSet { file: file_descriptors };
    let pool = DescriptorPool::from_file_descriptor_set(fd_set)
        .map_err(|e| format!("Failed to build descriptor pool from reflected proto: {}", e))?;

    // Cache the pool in the state
    let id = uuid::Uuid::new_v4().to_string();
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(id.clone(), pool);
    }

    // Re-get the pool to extract services (now in state)
    let pool = get_pool(state, &id)?;

    let services: Vec<GrpcServiceInfo> = pool.services()
        .map(|s| {
            let methods: Vec<GrpcMethodInfo> = s.methods()
                .map(|m| {
                    GrpcMethodInfo {
                        name: m.name().to_string(),
                        full_name: m.full_name().to_string(),
                        input_type: m.input().full_name().to_string(),
                        output_type: m.output().full_name().to_string(),
                        client_streaming: m.is_client_streaming(),
                        server_streaming: m.is_server_streaming(),
                        input_fields: get_message_fields(m.input()),
                        output_fields: get_message_fields(m.output()),
                    }
                })
                .collect();

            GrpcServiceInfo {
                name: s.name().to_string(),
                full_name: s.full_name().to_string(),
                methods,
            }
        })
        .collect();

    Ok(GrpcDescriptorSet { proto_id: id, services, from_cache: false })
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderMap;
    use http_body::Frame;
    // BodyExt is brought in via use super::* for method resolution
    use http_body_util::StreamBody;
    use hyper::body::Bytes;
    use futures_util::stream;
    use std::net::SocketAddr;
    use tokio::net::TcpListener;

    // ─── Unit tests: Parser functions ───────────────────────────

    #[test]
    fn test_build_parse_roundtrip() {
        let msg = b"Hello, gRPC!";
        let frame = build_grpc_frame(msg);
        assert_eq!(frame[0], 0u8); // uncompressed flag
        assert_eq!(frame[5..], msg[..]); // message body

        let (decoded, remaining) = parse_grpc_frame(&frame).unwrap();
        assert_eq!(decoded, msg);
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_parse_multiple_frames() {
        let msg1 = b"msg1";
        let msg2 = b"msg2";
        let mut combined = Vec::new();
        combined.extend_from_slice(&build_grpc_frame(msg1));
        combined.extend_from_slice(&build_grpc_frame(msg2));

        let (decoded1, rest) = parse_grpc_frame(&combined).unwrap();
        assert_eq!(decoded1, msg1);

        let (decoded2, rest) = parse_grpc_frame(rest).unwrap();
        assert_eq!(decoded2, msg2);
        assert!(rest.is_empty());
    }

    #[test]
    fn test_parse_truncated_frame() {
        let frame = build_grpc_frame(b"test");
        // Truncate to only 3 bytes (need at least 5)
        let err = parse_grpc_frame(&frame[..3]).unwrap_err();
        assert!(err.contains("Truncated"), "Error should mention truncation: {}", err);
    }

    #[test]
    fn test_parse_empty_body() {
        let frame = build_grpc_frame(b"");
        assert_eq!(frame.len(), 5); // 5-byte header, no data
        let (decoded, _) = parse_grpc_frame(&frame).unwrap();
        assert!(decoded.is_empty());
    }

    #[test]
    fn test_extract_grpc_status_from_headers() {
        let headers = vec![
            ("content-type".to_string(), "application/grpc".to_string()),
            ("grpc-status".to_string(), "0".to_string()),
            ("grpc-message".to_string(), "OK".to_string()),
        ];
        let (status, msg) = extract_grpc_status(&headers);
        assert_eq!(status, "0");
        assert_eq!(msg, "OK");
    }

    #[test]
    fn test_extract_grpc_status_with_error() {
        let headers = vec![
            ("grpc-status".to_string(), "5".to_string()),
            ("grpc-message".to_string(), "Resource not found".to_string()),
        ];
        let (status, msg) = extract_grpc_status(&headers);
        assert_eq!(status, "5");
        assert_eq!(msg, "Resource not found");
    }

    #[test]
    fn test_extract_grpc_status_defaults_to_zero() {
        let headers: Vec<(String, String)> = vec![
            ("content-type".to_string(), "application/grpc".to_string()),
        ];
        let (status, msg) = extract_grpc_status(&headers);
        assert_eq!(status, "0");
        assert!(msg.is_empty());
    }

    #[test]
    fn test_extract_grpc_status_trailer_overrides_header() {
        // Simulate: initial headers say status=0, trailers say status=5 (error)
        let headers = vec![
            ("grpc-status".to_string(), "0".to_string()),
            ("grpc-message".to_string(), "".to_string()),
            ("grpc-status".to_string(), "5".to_string()),  // trailer override
            ("grpc-message".to_string(), "Not found".to_string()),  // trailer override
        ];
        // rfind() returns the LAST match, so trailer values override header values
        let (status, msg) = extract_grpc_status(&headers);
        assert_eq!(status, "5", "Trailer status should override header status");
        assert_eq!(msg, "Not found", "Trailer message should override header message");
    }

    // ─── E2E test: In-process HTTP/2 gRPC server ────────────────

    /// Simple proto for testing — mirrors what grpcbin provides.
    const TEST_PROTO: &str = r#"
        syntax = "proto3";
        package testgrpc;

        message EchoMessage {
            string text = 1;
            int32 number = 2;
            repeated string items = 3;
        }

        message Empty {}

        service TestService {
            rpc Unary(EchoMessage) returns (EchoMessage);
            rpc ServerStreaming(EchoMessage) returns (stream EchoMessage);
            rpc ClientStreaming(stream EchoMessage) returns (EchoMessage);
            rpc BidiStreaming(stream EchoMessage) returns (stream EchoMessage);
            rpc ErrorUnary(EchoMessage) returns (Empty);
        }
    "#;

    /// Encode a protobuf message from a JSON string using a proto descriptor.
    fn encode_proto_from_json(
        pool: &DescriptorPool,
        message_type: &str,
        json: &str,
    ) -> Vec<u8> {
        let desc = pool.get_message_by_name(message_type)
            .expect("Message type not found");
        let json_val: serde_json::Value = serde_json::from_str(json).unwrap();
        let dynamic_msg = DynamicMessage::deserialize(desc, json_val).unwrap();
        let mut buf = Vec::new();
        Message::encode(&dynamic_msg, &mut buf).unwrap();
        buf
    }

    /// Start an in-process HTTP/2 gRPC test server. Returns the address it's listening on.
    async fn start_test_server() -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            // Accept multiple connections for tests that make multiple requests
            loop {
                let (stream, _) = match listener.accept().await {
                    Ok(conn) => conn,
                    Err(_) => break,
                };
                let io = TokioIo::new(stream);

                let service = hyper::service::service_fn(
                    |req: http::Request<hyper::body::Incoming>| async move {
                        // Extract the request path to determine method
                        let path = req.uri().path().to_string();

                        // Determine method from the last segment (e.g., "ErrorUnary" from "/testgrpc.TestService.ErrorUnary")
                        let method_name = path.rsplit('/').next().unwrap_or("").rsplit('.').next().unwrap_or("").to_string();

                        if method_name == "ClientStreaming" {
                            // Read all client frames, count them, return single response
                            let (_, body) = req.into_parts();
                            let collected = body.collect().await.unwrap();
                            let all_body_bytes = collected.to_bytes();

                            // Count frames in the body
                            let mut data = &all_body_bytes[..];
                            let mut frame_count = 0;
                            while !data.is_empty() {
                                match parse_grpc_frame(data) {
                                    Ok((_, rest)) => {
                                        frame_count += 1;
                                        data = rest;
                                    }
                                    Err(_) => break,
                                }
                            }

                            let response_msg = encode_proto_from_json(
                                &parse_test_proto(),
                                "testgrpc.EchoMessage",
                                &format!(r#"{{"text":"client_stream got {} messages","number":{}}}"#, frame_count, frame_count),
                            );

                            let mut trailers = HeaderMap::new();
                            trailers.insert("grpc-status", "0".parse().unwrap());

                            let body = StreamBody::new(stream::iter(vec![
                                Ok(Frame::data(Bytes::from(build_grpc_frame(&response_msg)))),
                                Ok(Frame::trailers(trailers)),
                            ]));

                            Ok::<_, hyper::Error>(
                                http::Response::builder()
                                    .status(200)
                                    .header("content-type", "application/grpc")
                                    .body(body)
                                    .unwrap()
                            )
                        } else if method_name == "BidiStreaming" {
                            // Bidirectional streaming: echo each client message back as a server response
                            let (_, body) = req.into_parts();
                            let collected = body.collect().await.unwrap();
                            let all_body_bytes = collected.to_bytes();

                            // Pre-compile proto for decoding
                            let test_pool = parse_test_proto();
                            let msg_desc = test_pool.get_message_by_name("testgrpc.EchoMessage").unwrap();

                            // Parse each client frame and build an echo response for each
                            let mut data = &all_body_bytes[..];
                            let mut response_frames: Vec<Result<Frame<Bytes>, hyper::Error>> = Vec::new();
                            while !data.is_empty() {
                                if let Ok((msg_bytes, rest)) = parse_grpc_frame(data) {
                                    // Decode protobuf bytes via DynamicMessage, then read the JSON-serialized values
                                    let dynamic = DynamicMessage::decode(msg_desc.clone(), msg_bytes.as_slice()).unwrap();
                                    let json_val = serde_json::to_value(&dynamic).unwrap_or_default();
                                    let number = json_val.get("number").and_then(|n| n.as_i64()).unwrap_or(0);
                                    let text = json_val.get("text").and_then(|t| t.as_str()).unwrap_or("");

                                    let response_msg = encode_proto_from_json(
                                        &test_pool,
                                        "testgrpc.EchoMessage",
                                        &format!(r#"{{"text":"echo: {}","number":{}}}"#, text, number * 2),
                                    );
                                    response_frames.push(Ok(Frame::data(Bytes::from(build_grpc_frame(&response_msg)))));
                                    data = rest;
                                } else {
                                    break;
                                }
                            }

                            // Add trailers at the end
                            let mut trailers = HeaderMap::new();
                            trailers.insert("grpc-status", "0".parse().unwrap());
                            response_frames.push(Ok(Frame::trailers(trailers)));

                            let body = StreamBody::new(stream::iter(response_frames));
                            Ok::<_, hyper::Error>(
                                http::Response::builder()
                                    .status(200)
                                    .header("content-type", "application/grpc")
                                    .body(body)
                                    .unwrap()
                            )
                        } else if method_name == "ErrorUnary" {
                            // Return error via initial response headers (standard gRPC error pattern)
                            let empty: Vec<Result<Frame<Bytes>, hyper::Error>> = vec![];
                            Ok::<_, hyper::Error>(
                                http::Response::builder()
                                    .status(200)
                                    .header("content-type", "application/grpc")
                                    .header("grpc-status", "5")
                                    .header("grpc-message", "Intentional test error")
                                    .body(StreamBody::new(stream::iter(empty)))
                                    .unwrap()
                            )
                        } else if method_name == "ServerStreaming" {
                            // Send multiple response frames + trailers
                            let msg1 = encode_proto_from_json(
                                &parse_test_proto(),
                                "testgrpc.EchoMessage",
                                r#"{"text":"stream1","number":1}"#,
                            );
                            let msg2 = encode_proto_from_json(
                                &parse_test_proto(),
                                "testgrpc.EchoMessage",
                                r#"{"text":"stream2","number":2}"#,
                            );

                            let frame1 = build_grpc_frame(&msg1);
                            let frame2 = build_grpc_frame(&msg2);

                            let mut trailers = HeaderMap::new();
                            trailers.insert("grpc-status", "0".parse().unwrap());

                            let body = StreamBody::new(stream::iter(vec![
                                Ok(Frame::data(Bytes::from(frame1))),
                                Ok(Frame::data(Bytes::from(frame2))),
                                Ok(Frame::trailers(trailers)),
                            ]));

                            Ok(http::Response::builder()
                                .status(200)
                                .header("content-type", "application/grpc")
                                .body(body)
                                .unwrap())
                        } else {
                            // Default: Unary echo
                            let response_msg = encode_proto_from_json(
                                &parse_test_proto(),
                                "testgrpc.EchoMessage",
                                r#"{"text":"hello back","number":42}"#,
                            );

                            let mut trailers = HeaderMap::new();
                            trailers.insert("grpc-status", "0".parse().unwrap());

                            let body = StreamBody::new(stream::iter(vec![
                                Ok(Frame::data(Bytes::from(build_grpc_frame(&response_msg)))),
                                Ok(Frame::trailers(trailers)),
                            ]));

                            Ok(http::Response::builder()
                                .status(200)
                                .header("content-type", "application/grpc")
                                .body(body)
                                .unwrap())
                        }
                    },
                );

                tokio::spawn(async move {
                    if let Err(e) = hyper::server::conn::http2::Builder::new(TokioExecutor::new())
                        .serve_connection(io, service)
                        .await
                    {
                        eprintln!("Test gRPC server connection error: {:?}", e);
                    }
                });
            }
        });

        addr
    }

    fn parse_test_proto() -> DescriptorPool {
        let tmp_dir = std::env::temp_dir();
        let file_name = format!("sireq_test_{}.proto", uuid::Uuid::new_v4());
        let tmp_path = tmp_dir.join(&file_name);
        std::fs::write(&tmp_path, TEST_PROTO).unwrap();
        let fd_set = compile([file_name.as_str()], [tmp_dir.to_str().unwrap()]).unwrap();
        let _ = std::fs::remove_file(&tmp_path);
        DescriptorPool::from_file_descriptor_set(fd_set).unwrap()
    }

    #[tokio::test]
    async fn test_grpc_unary_trailers_captured() {
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());

        // Parse the test proto
        let pool = parse_test_proto();

        // Make a unary call (use fully-qualified service name with package)
        let result = call_unary(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "Unary",
            r#"{"text":"hello","number":1}"#,
        ).await.expect("Unary call should succeed");

        // Verify response
        assert_eq!(result.status_code, "0", "gRPC status should be 0");
        assert!(result.error.is_none(), "No error expected");
        assert!(!result.body.is_empty(), "Response body should not be empty");
        assert!(result.body.contains("hello back"), "Body should contain echo response");
        assert!(result.body.contains("42"), "Body should contain number 42");

        // Verify headers contain grpc-status (from trailers)
        let has_grpc_status = result.headers.iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("grpc-status"));
        assert!(has_grpc_status, "Headers should include grpc-status from trailers");
    }

    #[tokio::test]
    async fn test_grpc_error_via_trailers() {
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        let result = call_unary(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "ErrorUnary",
            r#"{"text":"trigger error"}"#,
        ).await.expect("Error call should still return Ok result");

        // Verify error from initial headers is captured!
        assert_eq!(result.status_code, "5", "gRPC status should be 5 (NOT_FOUND)");
        assert!(result.error.is_some(), "Error should be reported");
        let err = result.error.as_ref().unwrap();
        assert!(err.contains("5"), "Error should mention status code 5: {}", err);
        assert!(err.contains("Intentional"), "Error should mention message: {}", err);
    }

    // ─── Reflection tests ───────────────────────────────────────────────

    /// Start a test server WITH reflection support.
    async fn start_reflection_test_server() -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        // Pre-compile reflection proto for the test server
        let ref_pool = Arc::new(get_reflection_pool().unwrap().clone());

        tokio::spawn(async move {
            loop {
                let (stream, _) = match listener.accept().await {
                    Ok(conn) => conn,
                    Err(_) => break,
                };
                let io = TokioIo::new(stream);
                let pool = ref_pool.clone();
            let service = hyper::service::service_fn(
                    move |req: http::Request<hyper::body::Incoming>| {
                        let pool = pool.clone();
                        async move {
                            let path = req.uri().path().to_string();

                            let (_, body) = req.into_parts();
                            let _ = body.collect().await.unwrap();

                            // Check if this is a reflection request
                            if path == "/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo" {
                                let resp_desc = pool.get_message_by_name("grpc.reflection.v1alpha.ServerReflectionResponse").unwrap();

                                                // Note: This test server always returns list_services_response
                                // regardless of the request type, so file_containing_symbol
                                // requests will fail (by design, for error-handling tests).
                                // Use camelCase field names to match prost-reflect JSON serialization.
                                let resp_json = serde_json::json!({
                                    "validHost": "",
                                    "originalRequest": {
                                        "host": "",
                                        "listServices": ""
                                    },
                                    "listServicesResponse": {
                                        "service": [
                                            {"name": "testgrpc.TestService"},
                                            {"name": "grpc.reflection.v1alpha.ServerReflection"}
                                        ]
                                    }
                                });

                                let dynamic_resp = DynamicMessage::deserialize(resp_desc, resp_json).unwrap();
                                let mut buf = Vec::new();
                                Message::encode(&dynamic_resp, &mut buf).unwrap();
                                let frame = build_grpc_frame(&buf);

                                let mut trailers = HeaderMap::new();
                                trailers.insert("grpc-status", "0".parse().unwrap());

                                let body = StreamBody::new(stream::iter(vec![
                                    Ok(Frame::data(Bytes::from(frame))),
                                    Ok(Frame::trailers(trailers)),
                                ]));

                                Ok::<_, hyper::Error>(
                                    http::Response::builder()
                                        .status(200)
                                        .header("content-type", "application/grpc")
                                        .body(body)
                                        .unwrap()
                                )
                            } else {
                                // Standard test service handling
                                let method_name = path.rsplit('/').next().unwrap_or("").rsplit('.').next().unwrap_or("").to_string();

                                let empty: Vec<Result<Frame<Bytes>, hyper::Error>> = vec![];
                                let body = StreamBody::new(stream::iter(empty));
                                Ok::<_, hyper::Error>(
                                    http::Response::builder()
                                        .status(200)
                                        .header("content-type", "application/grpc")
                                        .header("grpc-status", if method_name == "ErrorUnary" { "5" } else { "0" })
                                        .header("grpc-message", if method_name == "ErrorUnary" { "Unknown method" } else { "" })
                                        .body(body)
                                        .unwrap()
                                )
                            }
                        }
                    },
                );

                tokio::spawn(async move {
                    let _ = hyper::server::conn::http2::Builder::new(TokioExecutor::new())
                        .serve_connection(io, service)
                        .await;
                });
            }
        });

        addr
    }

    #[tokio::test]
    async fn test_reflection_list_services() {
        let addr = start_reflection_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());

        let result = reflect_list_services(&address, false).await;
        eprintln!("=== REFLECTION TEST DEBUG ===");
        match &result {
            Ok(s) => eprintln!("Services: {:?}", s),
            Err(e) => eprintln!("Error: {}", e),
        }
        let services = result.expect("Reflection should succeed");

        assert!(services.contains(&"testgrpc.TestService".to_string()),
            "Should find test service in: {:?}", services);
        assert!(services.contains(&"grpc.reflection.v1alpha.ServerReflection".to_string()),
            "Should find reflection service in: {:?}", services);
        assert_eq!(services.len(), 2, "Should have exactly 2 services");
    }

    #[tokio::test]
    async fn test_reflection_get_proto() {
        // For this test, we need the reflection server to return actual
        // FileDescriptorProto bytes. This is complex to set up in a test
        // server. Instead, we test that the reflection connection works
        // and the error handling is correct when trying to get proto from
        // a server that only supports list_services.
        let addr = start_reflection_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());

        // Try to get proto for a symbol — the test server doesn't support
        // file_containing_symbol, so it should return an error.
        let result = reflect_get_proto(
            &address,
            false,
            "testgrpc.TestService",
            &GrpcState(Arc::new(Mutex::new(HashMap::new()))),
        ).await;

        // We expect an error because our test server doesn't handle
        // file_containing_symbol (it sends an empty/error response)
        assert!(result.is_err(), "Should fail since test server doesn't support file_containing_symbol: {:?}", result);
    }

    #[tokio::test]
    async fn test_grpc_client_streaming() {
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        // Send 3 messages as client-streaming
        let input_jsons = vec![
            r#"{"text":"msg1","number":1}"#.to_string(),
            r#"{"text":"msg2","number":2}"#.to_string(),
            r#"{"text":"msg3","number":3}"#.to_string(),
        ];

        let result = call_client_streaming(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "ClientStreaming",
            input_jsons,
        ).await.expect("Client-streaming call should succeed");

        // Verify response
        assert_eq!(result.status_code, "0", "gRPC status should be 0");
        assert!(result.error.is_none(), "No error expected");
        assert!(!result.body.is_empty(), "Response body should not be empty");
        assert!(result.body.contains("3"), "Body should mention 3 messages sent: {}", result.body);
        assert!(result.body.contains("client_stream got 3 messages"),
            "Body should contain server confirmation: {}", result.body);

        // Verify headers contain grpc-status
        let has_grpc_status = result.headers.iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("grpc-status"));
        assert!(has_grpc_status, "Headers should include grpc-status");
    }

    #[tokio::test]
    async fn test_grpc_bidi_streaming() {
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        // Send 3 messages and expect 3 echo responses
        let input_jsons = vec![
            r#"{"text":"alpha","number":1}"#.to_string(),
            r#"{"text":"bravo","number":2}"#.to_string(),
            r#"{"text":"charlie","number":3}"#.to_string(),
        ];

        let results = call_bidi_streaming(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "BidiStreaming",
            input_jsons,
            10,
        ).await.expect("Bidirectional streaming call should succeed");

        // Should have received 3 echo responses
        assert_eq!(results.len(), 3, "Should receive 3 bidi streaming messages, got {}", results.len());

        // First message should echo "alpha" with number 2
        assert!(results[0].body.contains("alpha"), "First message should contain 'alpha': {}", results[0].body);
        assert!(results[0].body.contains("2"), "First message number should be doubled to 2: {}", results[0].body);

        // Second message should echo "bravo" with number 4
        assert!(results[1].body.contains("bravo"), "Second message should contain 'bravo': {}", results[1].body);
        assert!(results[1].body.contains("4"), "Second message number should be doubled to 4: {}", results[1].body);

        // Third message should echo "charlie" with number 6
        assert!(results[2].body.contains("charlie"), "Third message should contain 'charlie': {}", results[2].body);
        assert!(results[2].body.contains("6"), "Third message number should be doubled to 6: {}", results[2].body);

        // All should have grpc-status 0
        for (i, msg) in results.iter().enumerate() {
            assert_eq!(msg.status_code, "0", "Message {} should have status 0", i);
            assert!(msg.error.is_none(), "Message {} should have no error", i);
        }
    }

    #[tokio::test]
    async fn test_grpc_server_streaming_with_trailers() {
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        let results = call_server_streaming(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "ServerStreaming",
            r#"{"text":"stream","number":0}"#,
            10, // max messages
        ).await.expect("Streaming call should succeed");

        // Should have received 2 messages
        assert_eq!(results.len(), 2, "Should receive 2 streaming messages");

        // First message should be stream1
        assert!(results[0].body.contains("stream1"), "First message should be stream1: {}", results[0].body);
        assert!(results[0].body.contains("1"), "First message number should be 1");

        // Second message should be stream2
        assert!(results[1].body.contains("stream2"), "Second message should be stream2: {}", results[1].body);
        assert!(results[1].body.contains("2"), "Second message number should be 2");
    }

    // ─── Edge case tests ────────────────────────────────────────────────────

    #[test]
    fn test_build_grpc_frame_large_data() {
        // Build a frame with ~100KB of data
        let large_data = vec![b'x'; 100_000];
        let frame = build_grpc_frame(&large_data);

        // 1 byte compression flag + 4 byte length + 100,000 bytes = 100,005
        assert_eq!(frame.len(), 100_005);
        assert_eq!(frame[0], 0u8); // uncompressed

        // Verify length prefix
        let len = u32::from_be_bytes([frame[1], frame[2], frame[3], frame[4]]);
        assert_eq!(len, 100_000);

        // Round-trip: parse and verify data
        let (decoded, remaining) = parse_grpc_frame(&frame).unwrap();
        assert_eq!(decoded.len(), 100_000);
        assert_eq!(decoded, large_data);
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_decode_message_to_json_empty() {
        // decode_message_to_json with empty bytes should return empty string
        let pool = parse_test_proto();
        let msg_desc = pool.get_message_by_name("testgrpc.EchoMessage").unwrap();
        let result = decode_message_to_json(b"", &msg_desc).unwrap();
        assert!(result.is_empty(), "Empty bytes should produce empty string");
    }

    #[tokio::test]
    async fn test_unary_empty_message() {
        // Send empty JSON input to Unary — should work with default field values
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        let result = call_unary(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "Unary",
            r#"{}"#,
        ).await.expect("Unary call with empty message should succeed");

        assert_eq!(result.status_code, "0", "gRPC status should be 0");
        assert!(result.error.is_none(), "No error expected");
        assert!(!result.body.is_empty(), "Response body should not be empty");
        assert!(result.body.contains("hello back"), "Body should contain echo response");
        assert!(result.body.contains("42"), "Body should contain default number 42");
    }

    #[tokio::test]
    async fn test_unary_large_payload() {
        // Send a request with a very large items array
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        // Build JSON with 1000 items
        let items: Vec<String> = (0..1000).map(|i| format!("item_{}", i)).collect();
        let items_json = serde_json::to_string(&items).unwrap();
        let input = format!(r#"{{"text":"large","number":42,"items":{}}}"#, items_json);

        assert!(input.len() > 8_000, "Input should be large (was {} bytes)", input.len());

        let result = call_unary(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "Unary",
            &input,
        ).await.expect("Unary call with large payload should succeed");

        // Server always returns fixed echo, so just verify it didn't error
        assert_eq!(result.status_code, "0", "gRPC status should be 0");
        assert!(result.error.is_none(), "No error expected");
        assert!(!result.body.is_empty(), "Response should not be empty");
    }

    #[tokio::test]
    async fn test_bidi_large_text() {
        // Test bidirectional streaming with large text payload — verifies round-trip
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        // Create a 10KB text string
        let large_text = "A".repeat(10_000);
        let input_json = format!(r#"{{"text":"{}","number":5}}"#, large_text);

        let results = call_bidi_streaming(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "BidiStreaming",
            vec![input_json],
            10,
        ).await.expect("Bidi streaming with large text should succeed");

        assert_eq!(results.len(), 1, "Should receive 1 echo message");
        assert_eq!(results[0].status_code, "0", "gRPC status should be 0");
        assert!(results[0].error.is_none(), "No error expected");

        // Verify the echo contains the large text (server prepends "echo: ")
        assert!(results[0].body.contains(&large_text),
            "Response should contain the original large text");
        assert!(results[0].body.contains("echo: A"),
            "Response should have echo prefix");
        assert!(results[0].body.contains("10"),
            "Number should be doubled to 10");
        assert!(results[0].size > 10_000,
            "Response size should be > 10KB, was {}", results[0].size);
    }

    #[tokio::test]
    async fn test_server_streaming_max_messages_limit() {
        // Verify max_messages limits the number of streaming responses
        let addr = start_test_server().await;
        let address = format!("127.0.0.1:{}", addr.port());
        let pool = parse_test_proto();

        // Server sends 2 messages (stream1, stream2), but we only want 1
        let results = call_server_streaming(
            &address,
            false,
            &pool,
            "testgrpc.TestService",
            "ServerStreaming",
            r#"{"text":"limit_test","number":0}"#,
            1, // max_messages = 1 — should stop after first message
        ).await.expect("Streaming call should succeed");

        // Should have received only 1 message (limited by max_messages)
        assert_eq!(results.len(), 1, "Should receive only 1 message (limited by max_messages=1)");

        // That one message should be stream1 (the first one)
        assert!(results[0].body.contains("stream1"),
            "First message should be stream1: {}", results[0].body);
        assert_eq!(results[0].status_code, "0", "gRPC status should be 0");
        assert!(results[0].error.is_none(), "No error expected");
    }

    #[tokio::test]
    async fn test_connection_refused() {
        // Attempt connection to a port where nothing is listening
        let pool = parse_test_proto();

        let result = call_unary(
            "127.0.0.1:1",  // port 1 — nothing listens here
            false,
            &pool,
            "testgrpc.TestService",
            "Unary",
            r#"{}"#,
        ).await;

        // Must fail with a connection error (not a proto/gRPC error)
        assert!(result.is_err(), "Connection to port 1 should fail");
        let err = result.unwrap_err();
        // Should mention connection failure
        assert!(err.contains("connect") || err.contains("Failed") || err.contains("refused") || err.contains("timed out"),
            "Error should describe connection failure: {}", err);
    }
}

