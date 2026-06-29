import { safeInvoke } from "./safe-invoke";
import type { Collection, HttpRequest, RequestTemplate } from "./types";

// ─── Collection CRUD ────────────────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  return safeInvoke("get_collections");
}

export async function createCollection(name: string): Promise<Collection> {
  return safeInvoke("create_collection", { name });
}

export async function updateCollection(collection: Collection): Promise<void> {
  return safeInvoke("update_collection", { collection });
}

export async function deleteCollection(id: string): Promise<void> {
  return safeInvoke("delete_collection", { id });
}

// ─── Collection Tree Operations ──────────────────────────────────────────────

export async function createCollectionFolder(
  collectionId: string,
  name: string,
  parentFolderId?: string | null,
): Promise<Collection> {
  return safeInvoke("create_collection_folder", {
    collectionId,
    name,
    parentFolderId: parentFolderId ?? null,
  });
}

export async function addRequestToCollection(
  collectionId: string,
  request: HttpRequest,
  parentFolderId?: string | null,
  position?: number | null,
): Promise<Collection> {
  return safeInvoke("add_request_to_collection", {
    collectionId,
    request,
    parentFolderId: parentFolderId ?? null,
    position: position ?? null,
  });
}

export async function deleteCollectionItem(collectionId: string, itemId: string): Promise<Collection> {
  return safeInvoke("delete_collection_item", { collectionId, itemId });
}

export async function moveCollectionItem(
  collectionId: string,
  itemId: string,
  targetFolderId?: string | null,
  targetIndex?: number,
): Promise<Collection> {
  return safeInvoke("move_collection_item", {
    collectionId,
    itemId,
    targetFolderId: targetFolderId ?? null,
    targetIndex: targetIndex ?? 0,
  });
}

// ─── Import / Export ─────────────────────────────────────────────────────────

export async function importOpenApi(specContent: string, collectionName: string): Promise<Collection> {
  return safeInvoke("import_openapi", { specContent, collectionName });
}

export async function importPostmanCollection(specContent: string, collectionName?: string): Promise<Collection> {
  return safeInvoke("import_postman_collection", { specContent, collectionName: collectionName ?? null });
}

export async function exportPostmanCollection(collectionId: string): Promise<string> {
  return safeInvoke("export_postman_collection", { collectionId });
}

// ─── Template Commands ───────────────────────────────────────────────────────

export async function getTemplates(): Promise<RequestTemplate[]> {
  return safeInvoke("get_templates");
}

export async function createTemplate(
  name: string,
  description: string,
  request: HttpRequest,
  scope?: string,
): Promise<RequestTemplate> {
  return safeInvoke("create_template", { name, description, request, scope: scope ?? "global" });
}

export async function deleteTemplate(id: string): Promise<void> {
  return safeInvoke("delete_template", { id });
}
