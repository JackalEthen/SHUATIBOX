#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
pub struct SafState(pub std::sync::Mutex<Option<tauri::plugin::PluginHandle<tauri::Wry>>>);

#[cfg(target_os = "android")]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("safcopy")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.shuatibox.app.safcopy", "SafCopyPlugin")?;
            app.manage(SafState(std::sync::Mutex::new(Some(handle))));
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("safcopy").build()
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn saf_materialize(
    app: tauri::AppHandle,
    uri: String,
    max_depth: Option<u32>,
) -> Result<String, String> {
    let state = app.state::<SafState>();
    let handle = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| "复制插件未就绪".to_string())?;
    let payload = serde_json::json!({
        "uri": uri,
        "maxDepth": max_depth.unwrap_or(6),
    });
    let result: serde_json::Value = handle
        .run_mobile_plugin_async("copyTree", payload)
        .await
        .map_err(|error| error.to_string())?;
    result
        .get("path")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| "复制结果缺少路径".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn saf_materialize(_uri: String, _max_depth: Option<u32>) -> Result<String, String> {
    Err("该功能仅在 Android 端可用".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn saf_pick(app: tauri::AppHandle, kind: Option<String>) -> Result<String, String> {
    let state = app.state::<SafState>();
    let handle = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| "文件选择插件未就绪".to_string())?;
    let payload = serde_json::json!({ "kind": kind.unwrap_or_else(|| "folder".to_string()) });
    let result: serde_json::Value = handle
        .run_mobile_plugin_async("pick", payload)
        .await
        .map_err(|error| error.to_string())?;
    result
        .get("uri")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| "选择结果缺少 uri".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn saf_pick(_kind: Option<String>) -> Result<String, String> {
    Err("该功能仅在 Android 端可用".to_string())
}
