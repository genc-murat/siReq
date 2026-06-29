import { safeInvoke } from "./safe-invoke";
import type { Environment, GlobalVariables, StoredCookie } from "./types";

// ─── Environments ───────────────────────────────────────────────────────────

export async function getEnvironments(): Promise<Environment[]> {
  return safeInvoke("get_environments");
}

export async function createEnvironment(name: string): Promise<Environment> {
  return safeInvoke("create_environment", { name });
}

export async function updateEnvironment(environment: Environment): Promise<void> {
  return safeInvoke("update_environment", { environment });
}

export async function deleteEnvironment(id: string): Promise<void> {
  return safeInvoke("delete_environment", { id });
}

// ─── Global Variables & Secrets ─────────────────────────────────────────────

export async function getGlobalVariables(): Promise<GlobalVariables> {
  return safeInvoke("get_global_variables_cmd");
}

export async function saveGlobalVariables(global: GlobalVariables): Promise<void> {
  return safeInvoke("save_global_variables_cmd", { global });
}

export async function encryptSecretValue(plaintext: string): Promise<string> {
  return safeInvoke("encrypt_secret_value", { plaintext });
}

export async function decryptSecretValue(ciphertext: string): Promise<string> {
  return safeInvoke("decrypt_secret_value", { ciphertext });
}

// ─── Cookies ────────────────────────────────────────────────────────────────

export async function getCookies(): Promise<StoredCookie[]> {
  return safeInvoke("get_cookies");
}

export async function deleteCookie(id: string): Promise<void> {
  return safeInvoke("delete_cookie", { id });
}

export async function clearCookies(): Promise<void> {
  return safeInvoke("clear_cookies");
}
