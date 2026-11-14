#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
pub struct UpdateState(pub std::sync::Mutex<Option<tauri::plugin::PluginHandle<tauri::Wry>>>);

#[cfg(target_os = "android")]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("updateinstall")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.shuatibox.app.update", "UpdatePlugin")?;
            app.manage(UpdateState(std::sync::Mutex::new(Some(handle))));
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("updateinstall").build()
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    url: String,
    file_name: String,
) -> Result<String, String> {
    let state = app.state::<UpdateState>();
    let handle = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| "下载插件未就绪".to_string())?;
    let payload = serde_json::json!({ "url": url, "fileName": file_name });
    let result: serde_json::Value = handle
        .run_mobile_plugin_async("download", payload)
        .await
        .map_err(|error| error.to_string())?;
    result
        .get("status")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| "下载启动失败".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn download_update(_url: String, _file_name: String) -> Result<String, String> {
    Err("该功能仅在 Android 端可用".to_string())
}
