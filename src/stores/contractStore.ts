import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useRequestStore } from "./requestStore";

export interface ContractConfig {
  specContent: string;
  specName: string;
  path: string;
  method: string;
  statusCode: number;
}

interface ContractState {
  contracts: Record<string, ContractConfig>;
  bindContract: (requestId: string, config: ContractConfig) => void;
  unbindContract: (requestId: string) => void;
  getContract: (requestId: string) => ContractConfig | undefined;
}

// Recursive Resolver to dereference all local OpenAPI $ref structures
export function dereferenceSchema(schema: Record<string, unknown>, fullSpec: Record<string, unknown>): Record<string, unknown> {
  if (!schema) return schema;

  // Create deep copy
  const clone = JSON.parse(JSON.stringify(schema));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolve = (obj: any, visited = new Set<string>()): any => {
    if (obj === null || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => resolve(item, visited));
    }

    if (obj.$ref) {
      const refPath = obj.$ref;
      
      // Prevent infinite recursion in cyclical references (e.g. self-referencing schemas)
      if (visited.has(refPath)) {
        return { type: "object", description: `Cyclic reference to ${refPath}` };
      }
      visited.add(refPath);

      if (typeof refPath === "string" && refPath.startsWith("#/")) {
        const parts = refPath.replace(/^#\//, "").split("/");
        let current = fullSpec;
        for (const part of parts) {
          if (current === undefined || current === null) break;
          // Handle path keys with escaped slashes like ~1 or ~0
          const cleanPart = part.replace(/~1/g, "/").replace(/~0/g, "~");
          current = current[cleanPart];
        }
        
        if (current !== undefined && current !== null) {
          // Merge resolved ref attributes with any other sibling attributes of the ref (like description)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { $ref, ...rest } = obj;
          const resolved = resolve(current, new Set(visited));
          return { ...resolved, ...rest };
        }
      }
      return obj;
    }

    const nextObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      nextObj[key] = resolve(obj[key], visited);
    }
    return nextObj;
  };

  return resolve(clone);
}

// Traverse spec to find exact schema for path -> method -> response code
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getResponseSchemaFromSpec(spec: any, path: string, method: string, statusCode: number): any {
  if (!spec || !spec.paths) return null;

  const pathObj = spec.paths[path];
  if (!pathObj) return null;

  const methodObj = pathObj[method.toLowerCase()];
  if (!methodObj) return null;

  const responseObj = methodObj.responses?.[String(statusCode)] || methodObj.responses?.default;
  if (!responseObj) return null;

  // Resolve JSON content schema
  const jsonContent = responseObj.content?.["application/json"];
  if (jsonContent && jsonContent.schema) {
    return jsonContent.schema;
  }

  return null;
}

export const useContractStore = create<ContractState>()(
  persist(
    (set, get) => ({
      contracts: {},

      bindContract: (requestId, config) => {
        try {
          // Parse OpenAPI Specification
          const spec = JSON.parse(config.specContent);
          
          // Get Raw Schema
          const rawSchema = getResponseSchemaFromSpec(spec, config.path, config.method, config.statusCode);
          if (!rawSchema) {
            throw new Error(`No schema found in OpenAPI spec for ${config.method.toUpperCase()} ${config.path} -> Response ${config.statusCode}`);
          }

          // Dereference local schemas (e.g. components/schemas/User)
          const dereferenced = dereferenceSchema(rawSchema, spec);

          // Update Contract Store
          set((s) => ({
            contracts: {
              ...s.contracts,
              [requestId]: config,
            },
          }));

          // Automatically sync JSON Schema into Request Store
          useRequestStore.getState().setJsonSchema(JSON.stringify(dereferenced, null, 2));
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          throw new Error(`Failed to bind contract: ${errMsg}`, { cause: e });
        }
      },

      unbindContract: (requestId) => {
        set((s) => {
          const next = { ...s.contracts };
          delete next[requestId];
          return { contracts: next };
        });

        // Clear JSON Schema
        useRequestStore.getState().setJsonSchema("");
      },

      getContract: (requestId) => {
        return get().contracts[requestId];
      },
    }),
    {
      name: "sireq-contracts",
    }
  )
);
