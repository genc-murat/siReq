import {
  buildClientSchema,
  getIntrospectionQuery,
  printSchema,
  buildSchema,
  type GraphQLSchema,
} from "graphql";
import { sendRequest } from "@/lib/invoke";
import type { KeyValue, AuthConfig } from "@/lib/invoke";
import { buildGraphQLHeaders } from "./graphqlRequest";

export interface IntrospectionResult {
  schema: GraphQLSchema;
  sdl: string;
}

/**
 * Send the standard GraphQL introspection query to the endpoint and build
 * a GraphQLSchema object from the response.
 *
 * Property 9: Introspection Sorgu Formatı
 */
export async function introspectEndpoint(
  url: string,
  userHeaders: KeyValue[],
  auth: AuthConfig,
  environmentId: string | null
): Promise<IntrospectionResult> {
  const introspectionQuery = getIntrospectionQuery();

  const body = JSON.stringify({ query: introspectionQuery });

  const headers = buildGraphQLHeaders(userHeaders, auth);

  const request = {
    id: crypto.randomUUID(),
    name: "GraphQL Introspection",
    method: "POST" as const,
    url,
    headers,
    query_params: [],
    body_type: "json" as const,
    body,
    form_fields: [],
    auth,
    settings: {
      timeout: 30,
      follow_redirects: true,
      ssl_verify: true,
      proxy: null,
    },
    pre_script: "",
    post_script: "",
    examples: [],
    extractions: [],
  };

  const response = await sendRequest(request, 30, environmentId);

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Authentication required (HTTP ${response.status}). Add the appropriate auth headers.`
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Server returned HTTP ${response.status} ${response.status_text}.`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    throw new Error("Invalid response format: server did not return valid JSON.");
  }

  // Check if introspection is disabled
  const jsonObj = json as Record<string, unknown>;
  if (jsonObj.errors) {
    const errors = jsonObj.errors as Array<{ message?: string }>;
    const msg = errors[0]?.message ?? "Unknown error";
    if (
      msg.toLowerCase().includes("introspection") &&
      msg.toLowerCase().includes("disabled")
    ) {
      throw new Error("Introspection is disabled on this server.");
    }
    throw new Error(`GraphQL error: ${msg}`);
  }

  if (!jsonObj.data) {
    throw new Error("Invalid introspection response: missing 'data' field.");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = buildClientSchema((jsonObj.data as any).__schema ? jsonObj.data as any : (jsonObj.data as any));
    const sdl = printSchema(schema);
    return { schema, sdl };
  } catch (e) {
    throw new Error(`Failed to build schema from introspection result: ${e}`, { cause: e });
  }
}

/**
 * Build a GraphQLSchema from SDL (Schema Definition Language) text.
 *
 * Throws with line/column information if SDL is invalid.
 */
export function buildSchemaFromSDL(sdl: string): GraphQLSchema {
  try {
    return buildSchema(sdl);
  } catch (e) {
    throw new Error(`SDL parse error: ${e}`, { cause: e });
  }
}
