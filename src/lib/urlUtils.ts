import type { KeyValue } from "./invoke";

/**
 * Safely decodes a URI component string without throwing on malformed sequences.
 */
function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

/**
 * Encodes a query param key or value, preserving template variable syntax {{var_name}}.
 */
function safeEncodeParam(val: string): string {
  if (!val) return "";
  // If the value contains template placeholders {{...}}, encode parts around placeholders
  if (val.includes("{{") && val.includes("}}")) {
    return val
      .split(/(\{\{[^{}]+\}\})/g)
      .map((part) => (part.startsWith("{{") && part.endsWith("}}") ? part : encodeURIComponent(part)))
      .join("");
  }
  return encodeURIComponent(val);
}

/**
 * Splits a URL into base URL, query string (without '?'), and hash (without '#').
 */
export function splitUrl(url: string): { baseUrl: string; queryString: string; hash: string } {
  if (!url) {
    return { baseUrl: "", queryString: "", hash: "" };
  }

  let baseUrl = url;
  let queryString = "";
  let hash = "";

  // Extract hash first if present
  const hashIdx = baseUrl.indexOf("#");
  if (hashIdx !== -1) {
    hash = baseUrl.slice(hashIdx + 1);
    baseUrl = baseUrl.slice(0, hashIdx);
  }

  // Extract query string if present
  const queryIdx = baseUrl.indexOf("?");
  if (queryIdx !== -1) {
    queryString = baseUrl.slice(queryIdx + 1);
    baseUrl = baseUrl.slice(0, queryIdx);
  }

  return { baseUrl, queryString, hash };
}

/**
 * Parses query parameters from a full or partial URL into a KeyValue[] array.
 */
export function parseQueryParamsFromUrl(url: string): KeyValue[] {
  const { queryString } = splitUrl(url);
  if (!queryString) {
    return [];
  }

  const pairs: KeyValue[] = [];
  const tokens = queryString.split("&");

  for (const token of tokens) {
    if (!token) continue;
    const eqIdx = token.indexOf("=");
    if (eqIdx !== -1) {
      const rawKey = token.slice(0, eqIdx);
      const rawVal = token.slice(eqIdx + 1);
      pairs.push({
        key: safeDecode(rawKey),
        value: safeDecode(rawVal),
        enabled: true,
      });
    } else {
      pairs.push({
        key: safeDecode(token),
        value: "",
        enabled: true,
      });
    }
  }

  return pairs;
}

/**
 * Reconstructs a full URL using the base URL and active query parameters.
 */
export function buildUrlWithQueryParams(baseUrlOrUrl: string, params: KeyValue[]): string {
  const { baseUrl, hash } = splitUrl(baseUrlOrUrl);

  const activeParams = params.filter(
    (p) => p.enabled && (p.key.trim() !== "" || p.value.trim() !== "")
  );

  if (activeParams.length === 0) {
    return hash ? `${baseUrl}#${hash}` : baseUrl;
  }

  const queryParts = activeParams.map((p) => {
    const encodedKey = safeEncodeParam(p.key);
    if (!p.value) {
      return encodedKey;
    }
    const encodedVal = safeEncodeParam(p.value);
    return `${encodedKey}=${encodedVal}`;
  });

  const qs = queryParts.join("&");
  const fullBase = baseUrl ? `${baseUrl}?${qs}` : `?${qs}`;
  return hash ? `${fullBase}#${hash}` : fullBase;
}
