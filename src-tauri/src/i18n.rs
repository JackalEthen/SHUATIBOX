use std::sync::atomic::{AtomicBool, Ordering};

static EN: AtomicBool = AtomicBool::new(false);

pub fn apply_language(lang: &str) {
    EN.store(lang.eq_ignore_ascii_case("en"), Ordering::Relaxed);
}

pub fn is_en() -> bool {
    EN.load(Ordering::Relaxed)
}

pub fn tr<'a>(zh: &'a str, en: &'a str) -> &'a str {
    if is_en() { en } else { zh }
}

#[tauri::command]
pub fn set_language(lang: String) {
    apply_language(&lang);
}
