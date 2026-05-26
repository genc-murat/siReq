use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use rand::RngCore;
use std::fs;
use std::path::PathBuf;

const KEY_FILE_NAME: &str = "sireq.key";
const NONCE_SIZE: usize = 12; // AES-GCM standard nonce size

/// Get the path to the encryption key file in the app data directory.
fn get_key_path() -> Result<PathBuf, String> {
    let app_dir = dirs::data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())?
        .join("siReq");
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(app_dir.join(KEY_FILE_NAME))
}

/// Load or generate a 256-bit AES key.
fn load_or_generate_key() -> Result<[u8; 32], String> {
    let key_path = get_key_path()?;

    if key_path.exists() {
        let data = fs::read(&key_path).map_err(|e| format!("Failed to read key file: {}", e))?;
        if data.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&data);
            return Ok(key);
        }
    }

    // Generate new key
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);

    fs::write(&key_path, key).map_err(|e| format!("Failed to write key file: {}", e))?;

    Ok(key)
}

/// Encrypt a plaintext string using AES-256-GCM.
/// Returns base64-encoded ciphertext with nonce prepended.
pub fn encrypt_secret(plaintext: &str) -> Result<String, String> {
    let key = load_or_generate_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Prepend nonce to ciphertext and base64-encode
    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

/// Decrypt a base64-encoded ciphertext (with prepended nonce) using AES-256-GCM.
pub fn decrypt_secret(ciphertext_b64: &str) -> Result<String, String> {
    let key = load_or_generate_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let combined = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    if combined.len() < NONCE_SIZE {
        return Err("Invalid ciphertext: too short".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed (wrong key or corrupted data)".to_string())?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("Decrypted data is not valid UTF-8: {}", e))
}
