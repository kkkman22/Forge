pub mod app_logging;
pub mod commands;
pub mod keychain_manager;
pub mod process_manager;
pub mod sleep_guard;
pub mod status_watcher;
pub mod task_store;

use commands::AppState;
use process_manager::ProcessManager;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = app_logging::init_logging();

    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("forge-loop-desktop");

    let store_path = data_dir.join("tasks.json");
    let runs_dir = data_dir.join("runs");

    let _ = std::fs::create_dir_all(&runs_dir);

    let task_store = task_store::TaskStore::load(&store_path)
        .expect("failed to load task store");

    let resources_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap().parent().unwrap().join("Resources"))
        .unwrap_or_else(|_| PathBuf::from("./Resources"));

    let process_manager = ProcessManager::new(&resources_dir, &runs_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            task_store: Mutex::new(task_store),
            process_manager: AsyncMutex::new(process_manager),
            exit_poller_started: std::sync::atomic::AtomicBool::new(false),
            status_watcher: AsyncMutex::new(None),
            sleep_guard: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_task,
            commands::list_tasks,
            commands::get_task,
            commands::update_task,
            commands::delete_task,
            commands::reorder_task,
            commands::get_recent_repos,
            commands::start_task,
            commands::stop_task,
            commands::retry_task,
            commands::store_api_key,
            commands::get_auth_status,
            commands::clear_credentials,
            commands::get_sleep_status,
            commands::toggle_sleep_inhibit,
            commands::approve_task,
            commands::reject_task,
            commands::get_diff,
            commands::get_task_log,
            commands::export_diagnostics,
            commands::check_update,
        ])
        .setup(|app| {
            let res_dir = app.path().resource_dir()?;
            let node_bin = res_dir.join("node/bin/node");
            let cli_js = res_dir.join("forge-loop/dist/src/forge-loop-cli.js");
            if !node_bin.exists() || !cli_js.exists() {
                eprintln!(
                    "WARNING: Bundled resources incomplete. node={} cli={}",
                    node_bin.exists(),
                    cli_js.exists()
                );
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
