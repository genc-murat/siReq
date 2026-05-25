use crate::models::*;
use crate::storage::Db;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use tauri::State;

// ─── Public models ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiIntelligenceOverview {
    pub total_endpoints: u64,
    pub total_requests: u64,
    pub total_schema_changes: u64,
    pub endpoints_with_regression: u64,
    pub avg_response_time_ms: f64,
    pub last_analyzed: String,
    pub status_200_pct: f64,
    pub status_400_pct: f64,
    pub status_500_pct: f64,
    pub daily_request_counts: Vec<DailyCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCount {
    pub date: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointInsight {
    pub endpoint_key: String,
    pub method: String,
    pub request_count: u64,
    pub avg_time_ms: f64,
    pub p95_time_ms: f64,
    pub min_time_ms: f64,
    pub max_time_ms: f64,
    pub last_seen: String,
    pub first_seen: String,
    pub status_200_count: u64,
    pub status_400_count: u64,
    pub status_500_count: u64,
    pub status_other_count: u64,
    pub schema_version_count: u64,
    pub has_recent_regression: bool,
    pub avg_size_bytes: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointDetail {
    pub endpoint_key: String,
    pub method: String,
    pub request_count: u64,
    pub avg_time_ms: f64,
    pub p95_time_ms: f64,
    pub min_time_ms: f64,
    pub max_time_ms: f64,
    pub last_seen: String,
    pub first_seen: String,
    pub status_200_count: u64,
    pub status_400_count: u64,
    pub status_500_count: u64,
    pub status_other_count: u64,
    pub avg_size_bytes: f64,
    pub performance_history: Vec<PerformancePoint>,
    pub schema_evolution: Vec<SchemaVersionInfo>,
    pub recent_requests: Vec<RecentRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformancePoint {
    pub date: String,
    pub avg_ms: f64,
    pub p95_ms: f64,
    pub min_ms: f64,
    pub max_ms: f64,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaVersionInfo {
    pub fingerprint: String,
    pub seen_at: String,
    pub field_count: u64,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentRequest {
    pub id: String,
    pub created_at: String,
    pub status: u16,
    pub time_ms: u64,
    pub size: u64,
    pub schema_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceRegression {
    pub endpoint_key: String,
    pub method: String,
    pub current_avg_ms: f64,
    pub baseline_avg_ms: f64,
    pub increase_pct: f64,
}

// ─── Internal DB row ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
struct ApiIntelligenceRow {
    id: String,
    endpoint_key: String,
    method: String,
    first_seen: String,
    last_seen: String,
    request_count: u64,
    avg_time_ms: f64,
    p95_time_ms: f64,
    min_time_ms: f64,
    max_time_ms: f64,
    status_200_count: u64,
    status_400_count: u64,
    status_500_count: u64,
    status_other_count: u64,
    total_size_bytes: u64,
    schema_versions: String,      // JSON
    performance_history: String,  // JSON
    created_at: String,
    updated_at: String,
}

// ─── Schema fingerprinting ───────────────────────────────────────────────────

/// Extract a structural fingerprint from a JSON body.
/// Returns (fingerprint_hash, field_names, field_count).
fn extract_schema_fingerprint(body: &str) -> Option<(String, Vec<String>, u64)> {
    let json_val: serde_json::Value = serde_json::from_str(body).ok()?;
    let mut fields = Vec::new();
    extract_fields(&json_val, "", &mut fields);
    if fields.is_empty() {
        return None;
    }
    let field_count = fields.len() as u64;

    // Create a deterministic structure string for hashing
    let mut structure = String::new();
    for f in &fields {
        structure.push_str(f);
        structure.push('\n');
    }

    let mut hasher = Sha256::new();
    hasher.update(structure.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    Some((hash, fields, field_count))
}

fn extract_fields(val: &serde_json::Value, prefix: &str, fields: &mut Vec<String>) {
    match val {
        serde_json::Value::Object(map) => {
            if prefix.is_empty() {
                for (k, v) in map {
                    let path = k.clone();
                    let type_str = get_type_string(v);
                    fields.push(format!("{}:{}", path, type_str));
                    extract_fields(v, &path, fields);
                }
            } else {
                for (k, v) in map {
                    let path = format!("{}.{}", prefix, k);
                    let type_str = get_type_string(v);
                    fields.push(format!("{}:{}", path, type_str));
                    extract_fields(v, &path, fields);
                }
            }
        }
        serde_json::Value::Array(arr) => {
            // Sample first element for array item type
            if let Some(first) = arr.first() {
                let type_str = get_type_string(first);
                fields.push(format!("{}[]:{}", prefix, type_str));
                extract_fields(first, &format!("{}[]", prefix), fields);
            } else {
                fields.push(format!("{}[]:empty", prefix));
            }
        }
        _ => {}
    }
}

fn get_type_string(val: &serde_json::Value) -> &'static str {
    match val {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "boolean",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

// ─── Endpoint key normalization ──────────────────────────────────────────────

/// Normalize a URL path by replacing dynamic segments (UUIDs, numbers, hashes) with `{param}`.
/// E.g., `/api/users/123` → `/api/users/{param}`
///        `/api/users/abc-123-def` → `/api/users/{param}`
fn normalize_url_path(url: &str) -> String {
    // Parse the URL to extract path
    let parsed = url::Url::parse(url);
    let path = match parsed {
        Ok(ref u) => u.path().to_string(),
        Err(_) => url.to_string(),
    };

    // Split path into segments and normalize each
    let segments: Vec<&str> = path.split('/').collect();
    let normalized: Vec<String> = segments
        .into_iter()
        .map(|seg| {
            if seg.is_empty() {
                return seg.to_string();
            }
            // Check if segment looks like a UUID
            if is_uuid(seg) {
                return "{param}".to_string();
            }
            // Check if segment is purely numeric
            if seg.chars().all(|c| c.is_ascii_digit()) {
                return "{param}".to_string();
            }
            // Check if segment is a hex hash (e.g., a1b2c3d4...)
            if seg.len() >= 8 && seg.chars().all(|c| c.is_ascii_hexdigit()) {
                return "{param}".to_string();
            }
            seg.to_string()
        })
        .collect();

    normalized.join("/")
}

fn is_uuid(s: &str) -> bool {
    // UUID format: 8-4-4-4-12 hex digits with hyphens
    if s.len() == 36 {
        let parts: Vec<&str> = s.split('-').collect();
        if parts.len() == 5
            && parts[0].len() == 8
            && parts[1].len() == 4
            && parts[2].len() == 4
            && parts[3].len() == 4
            && parts[4].len() == 12
        {
            return parts.iter().all(|p| p.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }
    // Also match without hyphens (32 hex chars)
    if s.len() == 32 {
        return s.chars().all(|c| c.is_ascii_hexdigit());
    }
    false
}

fn build_endpoint_key(method: &HttpMethod, url: &str) -> String {
    let norm_path = normalize_url_path(url);
    format!("{:?} {}", method, norm_path)
}

// ─── Analysis logic ──────────────────────────────────────────────────────────

/// Scan the entire history table and compute API intelligence.
pub fn analyze_api_behavior(db: &State<Db>) -> Result<ApiIntelligenceOverview, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Fetch all history entries
    let mut stmt = conn
        .prepare("SELECT id, request, response, created_at FROM history ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let entries: Vec<HistoryEntry> = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let request_json: String = row.get(1)?;
            let response_json: String = row.get(2)?;
            let created_at: String = row.get(3)?;
            Ok((id, request_json, response_json, created_at))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(|(id, req_json, resp_json, created_at)| {
            let request: HttpRequest = serde_json::from_str(&req_json).ok()?;
            let response: HttpResponse = serde_json::from_str(&resp_json).ok()?;
            Some(HistoryEntry {
                id,
                request,
                response,
                created_at,
            })
        })
        .collect();

    drop(stmt);

    // Group by endpoint key
    let mut endpoint_map: HashMap<String, Vec<&HistoryEntry>> = HashMap::new();
    for entry in &entries {
        let key = build_endpoint_key(&entry.request.method, &entry.request.url);
        endpoint_map.entry(key).or_default().push(entry);
    }

    // Daily request counts
    let mut daily_map: HashMap<String, u64> = HashMap::new();
    for entry in &entries {
        // Extract date from ISO timestamp
        let date = if entry.created_at.len() >= 10 {
            entry.created_at[..10].to_string()
        } else {
            entry.created_at.clone()
        };
        *daily_map.entry(date).or_default() += 1;
    }
    let mut daily_counts: Vec<DailyCount> = daily_map
        .into_iter()
        .map(|(date, count)| DailyCount { date, count })
        .collect();
    daily_counts.sort_by(|a, b| a.date.cmp(&b.date));

    // Process each endpoint
    let mut total_requests = 0u64;
    let mut total_schema_changes = 0u64;
    let mut endpoints_with_regression = 0u64;
    let mut total_time_sum = 0.0f64;
    let mut total_time_count = 0u64;
    let mut total_200 = 0u64;
    let mut total_400 = 0u64;
    let mut total_500 = 0u64;
    // Clear and rebuild intelligence table
    conn.execute("DELETE FROM api_intelligence", [])
        .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    for (endpoint_key, entries_group) in &endpoint_map {
        let method = format!("{:?}", entries_group[0].request.method);

        let mut times_ms: Vec<f64> = Vec::new();
        let mut status_200 = 0u64;
        let mut status_400 = 0u64;
        let mut status_500 = 0u64;
        let mut status_other = 0u64;
        let mut total_size = 0u64;
        let mut first_seen = &entries_group[0].created_at;
        let mut last_seen = &entries_group[0].created_at;

        // Schema fingerprints over time
        let mut schema_versions: Vec<SchemaVersionInfo> = Vec::new();
        let mut seen_fingerprints: HashMap<String, bool> = HashMap::new();

        // Performance by day
        let mut perf_by_day: HashMap<String, Vec<f64>> = HashMap::new();

        // Recent requests
        let mut recent: Vec<RecentRequest> = Vec::new();

        for entry in entries_group {
            let resp = &entry.response;
            let t = resp.time_ms as f64;
            times_ms.push(t);

            total_size += resp.size;

            if entry.created_at < *first_seen {
                first_seen = &entry.created_at;
            }
            if entry.created_at > *last_seen {
                last_seen = &entry.created_at;
            }

            // Status classification
            match resp.status {
                200..=399 => status_200 += 1,
                400..=499 => status_400 += 1,
                500..=599 => status_500 += 1,
                _ => status_other += 1,
            }

            // Schema fingerprint
            if let Some((fp, fields, fcount)) = extract_schema_fingerprint(&resp.body) {
                if !seen_fingerprints.contains_key(&fp) {
                    seen_fingerprints.insert(fp.clone(), true);
                    schema_versions.push(SchemaVersionInfo {
                        fingerprint: fp.clone(),
                        seen_at: entry.created_at.clone(),
                        field_count: fcount,
                        fields,
                    });
                }
            }

            // Daily perf
            let date = if entry.created_at.len() >= 10 {
                entry.created_at[..10].to_string()
            } else {
                entry.created_at.clone()
            };
            perf_by_day.entry(date).or_default().push(t);

            // Recent (last 5)
            if recent.len() < 5 {
                let (fp, _, _) = extract_schema_fingerprint(&resp.body).unwrap_or_default();
                recent.push(RecentRequest {
                    id: entry.id.clone(),
                    created_at: entry.created_at.clone(),
                    status: resp.status,
                    time_ms: resp.time_ms,
                    size: resp.size,
                    schema_fingerprint: fp,
                });
            }
        }

        times_ms.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

        let count = times_ms.len() as u64;
        let avg = if count > 0 {
            times_ms.iter().sum::<f64>() / count as f64
        } else {
            0.0
        };
        let p95 = percentile_f64(&times_ms, 95.0);
        let min_t = *times_ms.first().unwrap_or(&0.0);
        let max_t = *times_ms.last().unwrap_or(&0.0);

        // Build performance history
        let mut perf_history: Vec<PerformancePoint> = perf_by_day
            .into_iter()
            .map(|(date, vals)| {
                let c = vals.len() as u64;
                let a = vals.iter().sum::<f64>() / c as f64;
                let mut sorted = vals.clone();
                sorted.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
                let p = percentile_f64(&sorted, 95.0);
                let mn = *sorted.first().unwrap_or(&0.0);
                let mx = *sorted.last().unwrap_or(&0.0);
                PerformancePoint {
                    date: date.clone(),
                    avg_ms: (a * 100.0).round() / 100.0,
                    p95_ms: (p * 100.0).round() / 100.0,
                    min_ms: mn,
                    max_ms: mx,
                    count: c,
                }
            })
            .collect();
        perf_history.sort_by(|a, b| a.date.cmp(&b.date));

        let schema_versions_json =
            serde_json::to_string(&schema_versions).map_err(|e| e.to_string())?;
        let perf_history_json =
            serde_json::to_string(&perf_history).map_err(|e| e.to_string())?;

        // Check for regression: compare last 7 days vs previous 7 days
        let has_regression = detect_regression(&perf_history);

        if has_regression {
            endpoints_with_regression += 1;
        }
        total_schema_changes += schema_versions.len() as u64 - 1; // first version is not a change

        total_requests += count;
        total_time_sum += avg * count as f64;
        total_time_count += count;
        total_200 += status_200;
        total_400 += status_400;
        total_500 += status_500;
        // Save to DB
        let row_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO api_intelligence (id, endpoint_key, method, first_seen, last_seen, request_count, avg_time_ms, p95_time_ms, min_time_ms, max_time_ms, status_200_count, status_400_count, status_500_count, status_other_count, total_size_bytes, schema_versions, performance_history, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            rusqlite::params![
                row_id, endpoint_key, method, first_seen, last_seen,
                count, avg, p95, min_t, max_t,
                status_200, status_400, status_500, status_other,
                total_size,
                schema_versions_json, perf_history_json,
                now, now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let overview = ApiIntelligenceOverview {
        total_endpoints: endpoint_map.len() as u64,
        total_requests,
        total_schema_changes,
        endpoints_with_regression,
        avg_response_time_ms: if total_time_count > 0 {
            (total_time_sum / total_time_count as f64 * 100.0).round() / 100.0
        } else {
            0.0
        },
        last_analyzed: now,
        status_200_pct: if total_requests > 0 {
            (total_200 as f64 / total_requests as f64 * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        },
        status_400_pct: if total_requests > 0 {
            (total_400 as f64 / total_requests as f64 * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        },
        status_500_pct: if total_requests > 0 {
            (total_500 as f64 / total_requests as f64 * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        },
        daily_request_counts: daily_counts,
    };

    Ok(overview)
}

fn detect_regression(history: &[PerformancePoint]) -> bool {
    if history.len() < 4 {
        return false; // Need at least 4 periods to detect trend
    }

    let recent: Vec<&PerformancePoint> = history.iter().rev().take(2).collect();
    let baseline: Vec<&PerformancePoint> = if history.len() >= 4 {
        history.iter().rev().skip(2).take(2).collect()
    } else {
        return false;
    };

    if recent.len() < 2 || baseline.len() < 2 {
        return false;
    }

    let recent_avg: f64 = recent.iter().map(|p| p.avg_ms).sum::<f64>() / recent.len() as f64;
    let baseline_avg: f64 = baseline.iter().map(|p| p.avg_ms).sum::<f64>() / baseline.len() as f64;

    if baseline_avg > 0.0 && recent_avg > baseline_avg * 1.2 {
        // 20% increase = regression
        return true;
    }

    false
}

fn percentile_f64(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p / 100.0) * (sorted.len() as f64 - 1.0)).round() as usize;
    *sorted.get(idx.min(sorted.len() - 1)).unwrap_or(&0.0)
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn analyze_api_behavior_cmd(db: State<'_, Db>) -> Result<ApiIntelligenceOverview, String> {
    analyze_api_behavior(&db)
}

#[tauri::command]
pub fn get_api_intelligence_overview(db: State<'_, Db>) -> Result<ApiIntelligenceOverview, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT COUNT(*) as total FROM api_intelligence")
        .map_err(|e| e.to_string())?;
    let total_endpoints: u64 = stmt
        .query_row([], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if total_endpoints == 0 {
        // Return empty overview
        return Ok(ApiIntelligenceOverview {
            total_endpoints: 0,
            total_requests: 0,
            total_schema_changes: 0,
            endpoints_with_regression: 0,
            avg_response_time_ms: 0.0,
            last_analyzed: String::new(),
            status_200_pct: 0.0,
            status_400_pct: 0.0,
            status_500_pct: 0.0,
            daily_request_counts: vec![],
        });
    }

    drop(stmt);

    // Aggregate from stored intelligence
    let mut stmt = conn
        .prepare("SELECT SUM(request_count), SUM(avg_time_ms * request_count) / SUM(request_count), SUM(status_200_count), SUM(status_400_count), SUM(status_500_count), SUM(status_other_count), MAX(updated_at) FROM api_intelligence")
        .map_err(|e| e.to_string())?;

    let row: Result<(u64, f64, u64, u64, u64, u64, String), _> = stmt.query_row([], |row| {
        Ok((
            row.get::<_, u64>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, u64>(2)?,
            row.get::<_, u64>(3)?,
            row.get::<_, u64>(4)?,
            row.get::<_, u64>(5)?,
            row.get::<_, String>(6)?,
        ))
    });

    match row {
        Ok((total_req, avg_time, s200, s400, s500, s_other, last_analyzed)) => {
            let total = (s200 + s400 + s500 + s_other) as f64;
            let (s200_pct, s400_pct, s500_pct) = if total > 0.0 {
                (
                    (s200 as f64 / total * 100.0 * 10.0).round() / 10.0,
                    (s400 as f64 / total * 100.0 * 10.0).round() / 10.0,
                    (s500 as f64 / total * 100.0 * 10.0).round() / 10.0,
                )
            } else {
                (0.0, 0.0, 0.0)
            };

            let total_schema_changes: u64 = {
                let mut stmt2 = conn
                    .prepare("SELECT schema_versions FROM api_intelligence")
                    .map_err(|e| e.to_string())?;
                let changes: Vec<u64> = stmt2
                    .query_map([], |row| {
                        let json_str: String = row.get(0)?;
                        let versions: Vec<SchemaVersionInfo> =
                            serde_json::from_str(&json_str).unwrap_or_default();
                        Ok(if versions.len() > 1 {
                            versions.len() as u64 - 1
                        } else {
                            0
                        })
                    })
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();
                changes.iter().sum()
            };

            let endpoints_with_regression: u64 = {
                let mut stmt2 = conn
                    .prepare("SELECT performance_history FROM api_intelligence")
                    .map_err(|e| e.to_string())?;
                let regressions: Vec<bool> = stmt2
                    .query_map([], |row| {
                        let json_str: String = row.get(0)?;
                        let perf: Vec<PerformancePoint> =
                            serde_json::from_str(&json_str).unwrap_or_default();
                        Ok(detect_regression(&perf))
                    })
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();
                regressions.iter().filter(|&&r| r).count() as u64
            };

            // Daily counts from history
            let mut daily_stmt = conn
                .prepare("SELECT DISTINCT substr(created_at, 1, 10) as day FROM history ORDER BY day ASC")
                .map_err(|e| e.to_string())?;
            let days: Vec<String> = daily_stmt
                .query_map([], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            let mut daily_counts = Vec::new();
            for day in &days {
                let mut count_stmt = conn
                    .prepare("SELECT COUNT(*) FROM history WHERE substr(created_at, 1, 10) = ?1")
                    .map_err(|e| e.to_string())?;
                let count: u64 = count_stmt
                    .query_row(rusqlite::params![day], |row| row.get(0))
                    .map_err(|e| e.to_string())?;
                daily_counts.push(DailyCount {
                    date: day.clone(),
                    count,
                });
            }

            Ok(ApiIntelligenceOverview {
                total_endpoints,
                total_requests: total_req,
                total_schema_changes,
                endpoints_with_regression,
                avg_response_time_ms: (avg_time * 100.0).round() / 100.0,
                last_analyzed,
                status_200_pct: s200_pct,
                status_400_pct: s400_pct,
                status_500_pct: s500_pct,
                daily_request_counts: daily_counts,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_all_endpoint_insights(
    db: State<'_, Db>,
) -> Result<Vec<EndpointInsight>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT endpoint_key, method, request_count, avg_time_ms, p95_time_ms, min_time_ms, max_time_ms, last_seen, first_seen, status_200_count, status_400_count, status_500_count, status_other_count, schema_versions, performance_history, total_size_bytes FROM api_intelligence ORDER BY request_count DESC")
        .map_err(|e| e.to_string())?;

    let insights = stmt
        .query_map([], |row| {
            let endpoint_key: String = row.get(0)?;
            let method: String = row.get(1)?;
            let request_count: u64 = row.get(2)?;
            let avg_time_ms: f64 = row.get(3)?;
            let p95_time_ms: f64 = row.get(4)?;
            let min_time_ms: f64 = row.get(5)?;
            let max_time_ms: f64 = row.get(6)?;
            let last_seen: String = row.get(7)?;
            let first_seen: String = row.get(8)?;
            let status_200_count: u64 = row.get(9)?;
            let status_400_count: u64 = row.get(10)?;
            let status_500_count: u64 = row.get(11)?;
            let status_other_count: u64 = row.get(12)?;
            let schema_versions_json: String = row.get(13)?;
            let perf_history_json: String = row.get(14)?;
            let total_size_bytes: u64 = row.get(15)?;
            Ok((
                endpoint_key, method, request_count, avg_time_ms, p95_time_ms,
                min_time_ms, max_time_ms, last_seen, first_seen,
                status_200_count, status_400_count, status_500_count, status_other_count,
                schema_versions_json, perf_history_json, total_size_bytes,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(
            |(
                endpoint_key,
                method,
                request_count,
                avg_time_ms,
                p95_time_ms,
                min_time_ms,
                max_time_ms,
                last_seen,
                first_seen,
                status_200_count,
                status_400_count,
                status_500_count,
                status_other_count,
                schema_versions_json,
                perf_history_json,
                total_size_bytes,
            )| {
                let perf: Vec<PerformancePoint> =
                    serde_json::from_str(&perf_history_json).unwrap_or_default();
                let schema_versions: Vec<SchemaVersionInfo> =
                    serde_json::from_str(&schema_versions_json).unwrap_or_default();
                let has_recent_regression = detect_regression(&perf);

                EndpointInsight {
                    endpoint_key,
                    method,
                    request_count,
                    avg_time_ms: (avg_time_ms * 100.0).round() / 100.0,
                    p95_time_ms: (p95_time_ms * 100.0).round() / 100.0,
                    min_time_ms,
                    max_time_ms,
                    last_seen,
                    first_seen,
                    status_200_count,
                    status_400_count,
                    status_500_count,
                    status_other_count,
                    schema_version_count: schema_versions.len() as u64,
                    has_recent_regression,
                    avg_size_bytes: if request_count > 0 {
                        (total_size_bytes as f64 / request_count as f64 * 100.0).round() / 100.0
                    } else {
                        0.0
                    },
                }
            },
        )
        .collect();

    Ok(insights)
}

#[tauri::command]
pub fn get_endpoint_detail_cmd(
    endpoint_key: String,
    db: State<'_, Db>,
) -> Result<EndpointDetail, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Fetch the stored intelligence row
    let mut stmt = conn
        .prepare("SELECT endpoint_key, method, request_count, avg_time_ms, p95_time_ms, min_time_ms, max_time_ms, last_seen, first_seen, status_200_count, status_400_count, status_500_count, status_other_count, total_size_bytes, schema_versions, performance_history FROM api_intelligence WHERE endpoint_key = ?1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row(rusqlite::params![endpoint_key], |row| {
        let ek: String = row.get(0)?;
        let method: String = row.get(1)?;
        let request_count: u64 = row.get(2)?;
        let avg_time_ms: f64 = row.get(3)?;
        let p95_time_ms: f64 = row.get(4)?;
        let min_time_ms: f64 = row.get(5)?;
        let max_time_ms: f64 = row.get(6)?;
        let last_seen: String = row.get(7)?;
        let first_seen: String = row.get(8)?;
        let status_200_count: u64 = row.get(9)?;
        let status_400_count: u64 = row.get(10)?;
        let status_500_count: u64 = row.get(11)?;
        let status_other_count: u64 = row.get(12)?;
        let total_size_bytes: u64 = row.get(13)?;
        let schema_versions_json: String = row.get(14)?;
        let perf_history_json: String = row.get(15)?;
        Ok((
            ek, method, request_count, avg_time_ms, p95_time_ms,
            min_time_ms, max_time_ms, last_seen, first_seen,
            status_200_count, status_400_count, status_500_count, status_other_count,
            total_size_bytes, schema_versions_json, perf_history_json,
        ))
    });

    match row {
        Ok((
            ek,
            method,
            request_count,
            avg_time_ms,
            p95_time_ms,
            min_time_ms,
            max_time_ms,
            last_seen,
            first_seen,
            status_200_count,
            status_400_count,
            status_500_count,
            status_other_count,
            total_size_bytes,
            schema_versions_json,
            perf_history_json,
        )) => {
            let schema_evolution: Vec<SchemaVersionInfo> =
                serde_json::from_str(&schema_versions_json).map_err(|e| e.to_string())?;
            let performance_history: Vec<PerformancePoint> =
                serde_json::from_str(&perf_history_json).map_err(|e| e.to_string())?;

            // Fetch recent requests from history table for this endpoint
            drop(stmt);
            let mut recent_stmt = conn
                .prepare("SELECT id, request, response, created_at FROM history ORDER BY created_at DESC LIMIT 10")
                .map_err(|e| e.to_string())?;

            let all_recent: Vec<RecentRequest> = recent_stmt
                .query_map([], |row| {
                    let id: String = row.get(0)?;
                    let request_json: String = row.get(1)?;
                    let response_json: String = row.get(2)?;
                    let created_at: String = row.get(3)?;
                    Ok((id, request_json, response_json, created_at))
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .filter_map(|(id, req_json, resp_json, created_at)| {
                    let request: HttpRequest = serde_json::from_str(&req_json).ok()?;
                    let response: HttpResponse = serde_json::from_str(&resp_json).ok()?;
                    let entry_key = build_endpoint_key(&request.method, &request.url);
                    if entry_key == ek {
                        let (fp, _, _) =
                            extract_schema_fingerprint(&response.body).unwrap_or_default();
                        Some(RecentRequest {
                            id,
                            created_at,
                            status: response.status,
                            time_ms: response.time_ms,
                            size: response.size,
                            schema_fingerprint: fp,
                        })
                    } else {
                        None
                    }
                })
                .take(5)
                .collect();

            Ok(EndpointDetail {
                endpoint_key: ek,
                method,
                request_count,
                avg_time_ms: (avg_time_ms * 100.0).round() / 100.0,
                p95_time_ms: (p95_time_ms * 100.0).round() / 100.0,
                min_time_ms,
                max_time_ms,
                last_seen,
                first_seen,
                status_200_count,
                status_400_count,
                status_500_count,
                status_other_count,
                avg_size_bytes: if request_count > 0 {
                    (total_size_bytes as f64 / request_count as f64 * 100.0).round() / 100.0
                } else {
                    0.0
                },
                performance_history,
                schema_evolution,
                recent_requests: all_recent,
            })
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(format!("Endpoint '{}' not found", endpoint_key))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_performance_timeline_cmd(
    endpoint_key: String,
    db: State<'_, Db>,
) -> Result<Vec<PerformancePoint>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT performance_history FROM api_intelligence WHERE endpoint_key = ?1")
        .map_err(|e| e.to_string())?;

    let result: Result<String, _> = stmt.query_row(rusqlite::params![endpoint_key], |row| {
        row.get(0)
    });

    match result {
        Ok(json_str) => {
            serde_json::from_str(&json_str).map_err(|e| e.to_string())
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_schema_evolution_cmd(
    endpoint_key: String,
    db: State<'_, Db>,
) -> Result<Vec<SchemaVersionInfo>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT schema_versions FROM api_intelligence WHERE endpoint_key = ?1")
        .map_err(|e| e.to_string())?;

    let result: Result<String, _> = stmt.query_row(rusqlite::params![endpoint_key], |row| {
        row.get(0)
    });

    match result {
        Ok(json_str) => {
            serde_json::from_str(&json_str).map_err(|e| e.to_string())
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_performance_regressions(
    db: State<'_, Db>,
) -> Result<Vec<PerformanceRegression>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT endpoint_key, method, avg_time_ms, performance_history FROM api_intelligence")
        .map_err(|e| e.to_string())?;

    let regressions: Vec<PerformanceRegression> = stmt
        .query_map([], |row| {
            let endpoint_key: String = row.get(0)?;
            let method: String = row.get(1)?;
            let avg_time_ms: f64 = row.get(2)?;
            let perf_json: String = row.get(3)?;
            Ok((endpoint_key, method, avg_time_ms, perf_json))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(
            |(endpoint_key, method, current_avg, perf_json)| {
                let perf: Vec<PerformancePoint> =
                    serde_json::from_str(&perf_json).ok()?;
                if detect_regression(&perf) && perf.len() >= 4 {
                    let baseline: Vec<&PerformancePoint> =
                        perf.iter().rev().skip(2).take(2).collect();
                    if baseline.len() == 2 {
                        let baseline_avg = baseline.iter().map(|p| p.avg_ms).sum::<f64>() / 2.0;
                        let increase_pct = if baseline_avg > 0.0 {
                            ((current_avg - baseline_avg) / baseline_avg * 100.0 * 10.0).round()
                                / 10.0
                        } else {
                            0.0
                        };
                        Some(PerformanceRegression {
                            endpoint_key,
                            method,
                            current_avg_ms: (current_avg * 100.0).round() / 100.0,
                            baseline_avg_ms: (baseline_avg * 100.0).round() / 100.0,
                            increase_pct,
                        })
                    } else {
                        None
                    }
                } else {
                    None
                }
            },
        )
        .collect();

    Ok(regressions)
}
