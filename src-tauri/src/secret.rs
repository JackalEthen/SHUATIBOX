use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const PREFIX: &str = "enc:v1:";

fn key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::db::base_dir(app)?.join("secret.key"))
}

fn load_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let path = key_path(app)?;
    if let Ok(bytes) = fs::read(&path) {
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    fs::write(&path, key).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(key)
}

pub(crate) fn encrypt(app: &AppHandle, plain: &str) -> Result<String, String> {
    let key = load_key(app)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut data = nonce.to_vec();
    data.extend(encrypted);
    Ok(format!("{PREFIX}{}", STANDARD.encode(data)))
}

pub(crate) fn decrypt(app: &AppHandle, stored: &str) -> Result<String, String> {
    if !stored.starts_with(PREFIX) {
        return Ok(stored.to_string());
    }
    let data = STANDARD
        .decode(&stored[PREFIX.len()..])
        .map_err(|error| error.to_string())?;
    if data.len() < 13 {
        return Err("invalid encrypted secret".to_string());
    }
    let key = load_key(app)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let plain = cipher
        .decrypt(Nonce::from_slice(&data[..12]), &data[12..])
        .map_err(|_| "无法解密 AI 密钥，请重新填写".to_string())?;
    String::from_utf8(plain).map_err(|error| error.to_string())
}
