import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  getCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  createCollectionFolder,
  addRequestToCollection,
  deleteCollectionItem,
  moveCollectionItem,
  importOpenApi,
  importPostmanCollection,
  exportPostmanCollection,
  getTemplates,
  createTemplate,
  deleteTemplate,
} = await import("./collections-api");
const { createMockRequest, createMockCollection } = await import("./test-utils");

describe("collection CRUD", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getCollections should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getCollections();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_collections");
  });

  it("createCollection should call safeInvoke with name", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("test"));
    const result = await createCollection("test");
    expect(mockSafeInvoke).toHaveBeenCalledWith("create_collection", { name: "test" });
    expect(result).toBeDefined();
  });

  it("updateCollection should call safeInvoke with collection", async () => {
    const col = createMockCollection("test");
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await updateCollection(col);
    expect(mockSafeInvoke).toHaveBeenCalledWith("update_collection", { collection: col });
  });

  it("deleteCollection should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteCollection("col-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_collection", { id: "col-1" });
  });
});

describe("collection tree operations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createCollectionFolder should call safeInvoke with parentFolderId null when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("test"));
    await createCollectionFolder("col-1", "folder1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("create_collection_folder", {
      collectionId: "col-1",
      name: "folder1",
      parentFolderId: null,
    });
  });

  it("createCollectionFolder should pass parentFolderId when provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("test"));
    await createCollectionFolder("col-1", "folder1", "parent-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("create_collection_folder", {
      collectionId: "col-1",
      name: "folder1",
      parentFolderId: "parent-1",
    });
  });

  it("addRequestToCollection should call safeInvoke with null defaults", async () => {
    const req = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("test"));
    await addRequestToCollection("col-1", req);
    expect(mockSafeInvoke).toHaveBeenCalledWith("add_request_to_collection", {
      collectionId: "col-1",
      request: req,
      parentFolderId: null,
      position: null,
    });
  });

  it("deleteCollectionItem should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("test"));
    await deleteCollectionItem("col-1", "item-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_collection_item", {
      collectionId: "col-1", itemId: "item-1",
    });
  });

  it("moveCollectionItem should call safeInvoke with default targetIndex", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("test"));
    await moveCollectionItem("col-1", "item-1", "folder-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("move_collection_item", {
      collectionId: "col-1",
      itemId: "item-1",
      targetFolderId: "folder-1",
      targetIndex: 0,
    });
  });
});

describe("import/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("importOpenApi should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("api"));
    await importOpenApi("spec content", "My API");
    expect(mockSafeInvoke).toHaveBeenCalledWith("import_openapi", {
      specContent: "spec content",
      collectionName: "My API",
    });
  });

  it("importPostmanCollection should pass null collectionName when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce(createMockCollection("pm"));
    await importPostmanCollection("spec content");
    expect(mockSafeInvoke).toHaveBeenCalledWith("import_postman_collection", {
      specContent: "spec content",
      collectionName: null,
    });
  });

  it("exportPostmanCollection should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce("exported json");
    const result = await exportPostmanCollection("col-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("export_postman_collection", { collectionId: "col-1" });
    expect(result).toBe("exported json");
  });
});

describe("templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getTemplates should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getTemplates();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_templates");
  });

  it("createTemplate should use default scope", async () => {
    const req = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce({ id: "tpl-1" });
    await createTemplate("name", "desc", req);
    expect(mockSafeInvoke).toHaveBeenCalledWith("create_template", {
      name: "name",
      description: "desc",
      request: req,
      scope: "global",
    });
  });

  it("deleteTemplate should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteTemplate("tpl-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_template", { id: "tpl-1" });
  });
});
