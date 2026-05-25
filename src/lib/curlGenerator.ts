import type { HttpRequest, KeyValue } from "@/lib/invoke";

export function generateCurl(request: HttpRequest): string {
  const parts: string[] = ["curl"];

  if (request.method !== "GET") {
    parts.push(`-X ${request.method}`);
  }

  const addHeaders = (headers: KeyValue[]) => {
    for (const h of headers) {
      if (h.enabled && h.key) {
        parts.push(`-H '${h.key}: ${h.value}'`);
      }
    }
  };

  addHeaders(request.headers);

  switch (request.auth.type) {
    case "basic":
      if (request.auth.username) {
        parts.push(`-u '${request.auth.username}:${request.auth.password}'`);
      }
      break;
    case "bearer":
      if (request.auth.token) {
        parts.push(`-H 'Authorization: Bearer ${request.auth.token}'`);
      }
      break;
    case "api_key":
      if (request.auth.api_key && request.auth.api_key_name) {
        if (request.auth.api_key_in === "header") {
          parts.push(`-H '${request.auth.api_key_name}: ${request.auth.api_key}'`);
        }
      }
      break;
  }

  if (request.body_type !== "none" && request.body) {
    parts.push(`-d '${request.body.replace(/'/g, "'\\''")}'`);
  }

  let url = request.url;
  const params = request.query_params.filter((p) => p.enabled && p.key);
  if (params.length > 0) {
    const qs = params.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
    url += (url.includes("?") ? "&" : "?") + qs;
  }

  parts.push(`'${url}'`);

  return parts.join(" \\\n  ");
}
