import { describe, it, expect } from "vitest";
import { parseQueryParamsFromUrl, buildUrlWithQueryParams, splitUrl } from "./urlUtils";

describe("urlUtils", () => {
  describe("splitUrl", () => {
    it("splits standard url with query and hash", () => {
      const res = splitUrl("https://api.example.com/posts?userId=1#section");
      expect(res).toEqual({
        baseUrl: "https://api.example.com/posts",
        queryString: "userId=1",
        hash: "section",
      });
    });

    it("handles url without query or hash", () => {
      const res = splitUrl("https://api.example.com/posts");
      expect(res).toEqual({
        baseUrl: "https://api.example.com/posts",
        queryString: "",
        hash: "",
      });
    });

    it("handles empty url", () => {
      const res = splitUrl("");
      expect(res).toEqual({
        baseUrl: "",
        queryString: "",
        hash: "",
      });
    });
  });

  describe("parseQueryParamsFromUrl", () => {
    it("parses single and multiple query parameters", () => {
      const url = "https://jsonplaceholder.typicode.com/posts?userId=1&_limit=2";
      const params = parseQueryParamsFromUrl(url);
      expect(params).toEqual([
        { key: "userId", value: "1", enabled: true },
        { key: "_limit", value: "2", enabled: true },
      ]);
    });

    it("handles encoded query values", () => {
      const url = "https://example.com/search?q=hello%20world&tag=%23tech";
      const params = parseQueryParamsFromUrl(url);
      expect(params).toEqual([
        { key: "q", value: "hello world", enabled: true },
        { key: "tag", value: "#tech", enabled: true },
      ]);
    });

    it("handles key without value", () => {
      const url = "https://example.com/flags?debug&verbose";
      const params = parseQueryParamsFromUrl(url);
      expect(params).toEqual([
        { key: "debug", value: "", enabled: true },
        { key: "verbose", value: "", enabled: true },
      ]);
    });

    it("returns empty array for url without query params", () => {
      const url = "https://example.com/posts";
      expect(parseQueryParamsFromUrl(url)).toEqual([]);
    });
  });

  describe("buildUrlWithQueryParams", () => {
    it("appends enabled params to base URL", () => {
      const baseUrl = "https://jsonplaceholder.typicode.com/posts";
      const params = [
        { key: "userId", value: "1", enabled: true },
        { key: "_limit", value: "2", enabled: true },
      ];
      const result = buildUrlWithQueryParams(baseUrl, params);
      expect(result).toBe("https://jsonplaceholder.typicode.com/posts?userId=1&_limit=2");
    });

    it("replaces existing query params in URL with new params", () => {
      const currentUrl = "https://jsonplaceholder.typicode.com/posts?old=123";
      const params = [{ key: "userId", value: "5", enabled: true }];
      const result = buildUrlWithQueryParams(currentUrl, params);
      expect(result).toBe("https://jsonplaceholder.typicode.com/posts?userId=5");
    });

    it("omits disabled params", () => {
      const baseUrl = "https://jsonplaceholder.typicode.com/posts";
      const params = [
        { key: "userId", value: "1", enabled: true },
        { key: "_limit", value: "2", enabled: false },
      ];
      const result = buildUrlWithQueryParams(baseUrl, params);
      expect(result).toBe("https://jsonplaceholder.typicode.com/posts?userId=1");
    });

    it("returns baseUrl if all params are disabled or empty", () => {
      const baseUrl = "https://jsonplaceholder.typicode.com/posts";
      const params = [
        { key: "", value: "", enabled: true },
        { key: "_limit", value: "2", enabled: false },
      ];
      const result = buildUrlWithQueryParams(baseUrl, params);
      expect(result).toBe("https://jsonplaceholder.typicode.com/posts");
    });

    it("preserves template variables in query params", () => {
      const baseUrl = "{{baseUrl}}/posts";
      const params = [{ key: "userId", value: "{{currentUserId}}", enabled: true }];
      const result = buildUrlWithQueryParams(baseUrl, params);
      expect(result).toBe("{{baseUrl}}/posts?userId={{currentUserId}}");
    });
  });
});
