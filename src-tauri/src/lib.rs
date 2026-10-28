mod ai;
mod commands;
mod db;
mod importer;
mod models;
mod saf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(saf::plugin())
        .setup(|app| {
            if let Err(error) = db::init_user(app.handle()) {
                eprintln!("初始化本地数据库失败：{error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::home_summary,
            commands::start_session,
            commands::get_session,
            commands::resume_session,
            commands::save_answer,
            commands::finish_session,
            commands::list_papers,
            commands::search_questions,
            commands::list_wrong,
            commands::clear_wrong,
            commands::toggle_favorite,
            commands::is_favorite,
            commands::list_favorites,
            commands::get_note,
            commands::save_note,
            commands::add_report,
            commands::update_question,
            commands::get_settings,
            commands::set_settings,
            commands::stats,
            commands::list_banks_cmd,
            commands::switch_bank,
            commands::revalidate_bank,
            commands::delete_bank,
            commands::export_backup,
            commands::import_backup,
            commands::clear_history,
            commands::import_bank,
            commands::import_into_bank,
            ai::ai_import,
            commands::save_avatar,
            commands::load_practice_questions,
            saf::saf_materialize,
            saf::saf_pick
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
