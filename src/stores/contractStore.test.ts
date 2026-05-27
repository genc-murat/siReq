import { describe, it, expect, beforeEach, vi } from "vitest";
import { dereferenceSchema, getResponseSchemaFromSpec, useContractStore } from "./contractStore";

// ── Mock useRequestStore ───────────────────────────────────────────────────

const { mockRequestStore } = vi.hoisted(() => ({
  mockRequestStore: {
    setJsonSchema: vi.fn(),
  },
}));

vi.mock("./requestStore", () => ({
  useRequestStore: { getState: vi.fn(() => mockRequestStore) },
}));

// ── Sample OpenAPI Specs ───────────────────────────────────────────────────

const petStoreSpec = {
  openapi: "3.0.0",
  info: { title: "Pet Store", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        responses: {
          "200": {
            description: "A list of pets",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Pet" },
                },
              },
            },
          },
          default: {
            description: "Unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      post: {
        operationId: "createPet",
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        operationId: "getPet",
        responses: {
          "200": {
            description: "A pet",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "integer", format: "int64" },
          name: { type: "string" },
          tag: { type: "string" },
        },
      },
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "integer", format: "int32" },
          message: { type: "string" },
        },
      },
    },
  },
};

const cyclicSpec = {
  openapi: "3.0.0",
  info: { title: "Cyclic", version: "1.0.0" },
  paths: {
    "/item": {
      get: {
        responses: {
          "200": {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Node: {
        type: "object",
        properties: {
          name: { type: "string" },
          child: { $ref: "#/components/schemas/Node" },
          children: {
            type: "array",
            items: { $ref: "#/components/schemas/Node" },
          },
        },
      },
    },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function resetContractStore() {
  localStorage.removeItem("sireq-contracts");
  useContractStore.setState({ contracts: {} });
}

function resetMocks() {
  mockRequestStore.setJsonSchema.mockReset();
}

// ─────────────────────────────────────────────────────────────────────────────
// dereferenceSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("dereferenceSchema", () => {
  it("returns null for null input", () => {
    expect(dereferenceSchema(null, petStoreSpec)).toBeNull();
  });

  it("returns undefined for undefined input", () => {
    expect(dereferenceSchema(undefined, petStoreSpec)).toBeUndefined();
  });

  it("returns a deep clone when schema has no $ref", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } };
    const result = dereferenceSchema(schema, petStoreSpec);
    expect(result).toEqual(schema);
    expect(result).not.toBe(schema);
  });

  it("resolves a simple $ref to inline the referenced schema", () => {
    const schema = { $ref: "#/components/schemas/Pet" };
    const result = dereferenceSchema(schema, petStoreSpec);

    expect(result).toEqual(petStoreSpec.components.schemas.Pet);
    expect(result.type).toBe("object");
    expect(result.properties.name.type).toBe("string");
  });

  it("resolves nested $ref in items of an array", () => {
    const schema = {
      type: "array",
      items: { $ref: "#/components/schemas/Pet" },
    };
    const result = dereferenceSchema(schema, petStoreSpec);

    expect(result.type).toBe("array");
    expect(result.items.type).toBe("object");
    expect(result.items.properties.id.type).toBe("integer");
  });

  it("resolves nested $ref in properties", () => {
    const schema = {
      type: "object",
      properties: {
        pet: { $ref: "#/components/schemas/Pet" },
        error: { $ref: "#/components/schemas/Error" },
      },
    };
    const result = dereferenceSchema(schema, petStoreSpec);

    expect(result.properties.pet.type).toBe("object");
    expect(result.properties.pet.properties.name.type).toBe("string");
    expect(result.properties.error.type).toBe("object");
    expect(result.properties.error.properties.code.type).toBe("integer");
  });

  it("handles cyclic $ref with a placeholder", () => {
    const schema = { $ref: "#/components/schemas/Node" };
    const result = dereferenceSchema(schema, cyclicSpec);

    // First occurrence resolves fully
    expect(result.properties.name.type).toBe("string");
    expect(result.properties.child).toBeDefined();
    // Second occurrence (cyclic) gets placeholder
    expect(result.properties.child.type).toBe("object");
    expect(result.properties.child.description).toContain("Cyclic reference");
    // Array items with cyclic ref
    expect(result.properties.children.type).toBe("array");
    expect(result.properties.children.items.type).toBe("object");
    expect(result.properties.children.items.description).toContain("Cyclic reference");
  });

  it("preserves sibling attributes next to $ref", () => {
    const schema = {
      $ref: "#/components/schemas/Pet",
      description: "A pet from the store",
    };
    const result = dereferenceSchema(schema, petStoreSpec);

    expect(result.type).toBe("object");
    expect(result.properties.name.type).toBe("string");
    expect(result.description).toBe("A pet from the store");
  });

  it("returns original $ref object when target is not found", () => {
    const schema = { $ref: "#/components/schemas/NonExistent" };
    const result = dereferenceSchema(schema, petStoreSpec);

    // Since the ref target doesn't exist, it keeps the original $ref object
    expect(result.$ref).toBe("#/components/schemas/NonExistent");
  });

  it("handles escaped ref paths (~1 for /, ~0 for ~)", () => {
    const schema = { $ref: "#/components/schemas/~1Users~1Response" };
    // Make sure the target exists
    const spec = {
      components: {
        schemas: {
          "/Users/Response": {
            type: "object",
            properties: { data: { type: "string" } },
          },
        },
      },
    };
    const result = dereferenceSchema(schema, spec);
    expect(result.properties.data.type).toBe("string");
  });

  it("preserves non-$ref attributes when resolving", () => {
    const schema = {
      $ref: "#/components/schemas/Pet",
      nullable: true,
      description: "My pet",
    };
    const result = dereferenceSchema(schema, petStoreSpec);

    expect(result.type).toBe("object");
    expect(result.nullable).toBe(true);
    expect(result.description).toBe("My pet");
  });

  it("does not modify the original spec object", () => {
    const schema = { $ref: "#/components/schemas/Pet" };
    const originalSpec = JSON.parse(JSON.stringify(petStoreSpec));

    dereferenceSchema(schema, petStoreSpec);

    expect(petStoreSpec).toEqual(originalSpec);
  });

  it("handles deeply nested schema with multiple refs", () => {
    const nestedSpec = {
      components: {
        schemas: {
          A: {
            type: "object",
            properties: {
              b: { $ref: "#/components/schemas/B" },
            },
          },
          B: {
            type: "object",
            properties: {
              c: { $ref: "#/components/schemas/C" },
              value: { type: "string" },
            },
          },
          C: {
            type: "object",
            properties: {
              count: { type: "integer" },
            },
          },
        },
      },
    };

    const result = dereferenceSchema({ $ref: "#/components/schemas/A" }, nestedSpec);

    expect(result.properties.b.properties.c.properties.count.type).toBe("integer");
    expect(result.properties.b.properties.value.type).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getResponseSchemaFromSpec
// ─────────────────────────────────────────────────────────────────────────────

describe("getResponseSchemaFromSpec", () => {
  it("returns schema for a valid path, method, and status code", () => {
    const result = getResponseSchemaFromSpec(petStoreSpec, "/pets", "GET", 200);
    expect(result).toBeDefined();
    expect(result.type).toBe("array");
  });

  it("returns null when spec is null", () => {
    expect(getResponseSchemaFromSpec(null, "/pets", "GET", 200)).toBeNull();
  });

  it("returns null when spec has no paths", () => {
    expect(getResponseSchemaFromSpec({}, "/pets", "GET", 200)).toBeNull();
  });

  it("returns null when path is not found", () => {
    expect(getResponseSchemaFromSpec(petStoreSpec, "/nonexistent", "GET", 200)).toBeNull();
  });

  it("returns null when method is not found on the path", () => {
    expect(getResponseSchemaFromSpec(petStoreSpec, "/pets", "DELETE", 200)).toBeNull();
  });

  it("returns null when status code is not found and no default", () => {
    const spec = {
      paths: {
        "/test": {
          get: {
            responses: {
              "200": {
                content: { "application/json": { schema: { type: "string" } } },
              },
            },
          },
        },
      },
    };
    expect(getResponseSchemaFromSpec(spec, "/test", "GET", 404)).toBeNull();
  });

  it("falls back to default response when status code is not found but default exists", () => {
    const result = getResponseSchemaFromSpec(petStoreSpec, "/pets", "GET", 500);
    expect(result).toBeDefined();
    expect(result.$ref).toBe("#/components/schemas/Error");
  });

  it("returns null when response has no JSON content", () => {
    const spec = {
      paths: {
        "/test": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "text/plain": { schema: { type: "string" } },
                },
              },
            },
          },
        },
      },
    };
    expect(getResponseSchemaFromSpec(spec, "/test", "GET", 200)).toBeNull();
  });

  it("is case-insensitive for method", () => {
    const result1 = getResponseSchemaFromSpec(petStoreSpec, "/pets", "get", 200);
    const result2 = getResponseSchemaFromSpec(petStoreSpec, "/pets", "GET", 200);
    expect(result1).toEqual(result2);
  });

  it("handles text/plain response content (returns null)", () => {
    const spec = {
      paths: {
        "/test": {
          get: {
            responses: {
              "200": {
                content: {
                  "text/plain": { schema: { type: "string" } },
                },
              },
            },
          },
        },
      },
    };
    expect(getResponseSchemaFromSpec(spec, "/test", "GET", 200)).toBeNull();
  });

  it("returns schema with $ref for validation status codes", () => {
    const result = getResponseSchemaFromSpec(petStoreSpec, "/pets/{petId}", "GET", 200);
    expect(result).toBeDefined();
    expect(result.$ref).toBe("#/components/schemas/Pet");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store actions: bindContract, unbindContract, getContract
// ─────────────────────────────────────────────────────────────────────────────

describe("contractStore actions", () => {
  beforeEach(() => {
    resetContractStore();
    resetMocks();
  });

  // ── bindContract ──────────────────────────────────────────────────────

  describe("bindContract", () => {
    it("binds a contract and syncs dereferenced schema to requestStore", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });

      // Contract stored
      const contract = useContractStore.getState().contracts["req-1"];
      expect(contract).toBeDefined();
      expect(contract.specName).toBe("Pet Store");
      expect(contract.path).toBe("/pets/{petId}");

      // Request store's setJsonSchema was called with dereferenced schema
      expect(mockRequestStore.setJsonSchema).toHaveBeenCalledTimes(1);
      const jsonSchemaArg = mockRequestStore.setJsonSchema.mock.calls[0][0];
      const parsed = JSON.parse(jsonSchemaArg);
      expect(parsed.type).toBe("object");
      expect(parsed.properties.name.type).toBe("string");
      expect(parsed.properties.id.type).toBe("integer");
    });

    it("binds a contract with array response schema", () => {
      useContractStore.getState().bindContract("req-2", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets",
        method: "GET",
        statusCode: 200,
      });

      const jsonSchemaArg = mockRequestStore.setJsonSchema.mock.calls[0][0];
      const parsed = JSON.parse(jsonSchemaArg);
      expect(parsed.type).toBe("array");
      expect(parsed.items.properties.name.type).toBe("string");
    });

    it("throws when spec JSON is invalid", () => {
      expect(() => {
        useContractStore.getState().bindContract("req-bad", {
          specContent: "not valid json",
          specName: "Bad",
          path: "/pets",
          method: "GET",
          statusCode: 200,
        });
      }).toThrow(/Failed to bind contract/i);
    });

    it("throws when schema is not found for the given path/method/statusCode", () => {
      expect(() => {
        useContractStore.getState().bindContract("req-404", {
          specContent: JSON.stringify(petStoreSpec),
          specName: "Pet Store",
          path: "/nonexistent",
          method: "GET",
          statusCode: 200,
        });
      }).toThrow(/No schema found/i);
    });

    it("stores multiple contracts independently", () => {
      useContractStore.getState().bindContract("req-a", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });

      useContractStore.getState().bindContract("req-b", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets",
        method: "POST",
        statusCode: 201,
      });

      const contracts = useContractStore.getState().contracts;
      expect(Object.keys(contracts)).toHaveLength(2);
      expect(contracts["req-a"].path).toBe("/pets/{petId}");
      expect(contracts["req-b"].path).toBe("/pets");
    });

    it("calls setJsonSchema with prettified JSON", () => {
      useContractStore.getState().bindContract("req-pretty", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });

      const jsonSchemaArg = mockRequestStore.setJsonSchema.mock.calls[0][0];
      // Prettified JSON has newlines and 2-space indentation
      expect(jsonSchemaArg).toContain("\n");
      expect(jsonSchemaArg).toContain("  ");
    });
  });

  // ── unbindContract ────────────────────────────────────────────────────

  describe("unbindContract", () => {
    it("removes the contract from the store", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });

      useContractStore.getState().unbindContract("req-1");

      expect(useContractStore.getState().contracts["req-1"]).toBeUndefined();
    });

    it("clears the jsonSchema in requestStore", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });

      // Reset call count from bindContract
      mockRequestStore.setJsonSchema.mockClear();

      useContractStore.getState().unbindContract("req-1");

      expect(mockRequestStore.setJsonSchema).toHaveBeenCalledWith("");
    });

    it("does not affect other contracts", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });
      useContractStore.getState().bindContract("req-2", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets",
        method: "POST",
        statusCode: 201,
      });

      useContractStore.getState().unbindContract("req-1");

      const contracts = useContractStore.getState().contracts;
      expect(Object.keys(contracts)).toHaveLength(1);
      expect(contracts["req-2"]).toBeDefined();
    });

    it("handles unbinding a non-existent contract gracefully", () => {
      expect(() => {
        useContractStore.getState().unbindContract("non-existent");
      }).not.toThrow();
    });
  });

  // ── getContract ───────────────────────────────────────────────────────

  describe("getContract", () => {
    it("returns the contract when it exists", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });

      const contract = useContractStore.getState().getContract("req-1");
      expect(contract).toBeDefined();
      expect(contract!.path).toBe("/pets/{petId}");
    });

    it("returns undefined when contract does not exist", () => {
      const contract = useContractStore.getState().getContract("nonexistent");
      expect(contract).toBeUndefined();
    });

    it("returns undefined after contract is unbound", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });
      useContractStore.getState().unbindContract("req-1");

      expect(useContractStore.getState().getContract("req-1")).toBeUndefined();
    });
  });

  // ── Persistence ──────────────────────────────────────────────────────

  describe("persistence", () => {
    it("can rebind after unbind", () => {
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets/{petId}",
        method: "GET",
        statusCode: 200,
      });
      useContractStore.getState().unbindContract("req-1");

      // Re-bind
      mockRequestStore.setJsonSchema.mockClear();
      useContractStore.getState().bindContract("req-1", {
        specContent: JSON.stringify(petStoreSpec),
        specName: "Pet Store",
        path: "/pets",
        method: "GET",
        statusCode: 200,
      });

      const contract = useContractStore.getState().getContract("req-1");
      expect(contract).toBeDefined();
      expect(contract!.path).toBe("/pets");
    });
  });
});
