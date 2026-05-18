pub mod app_logging;
pub mod commands;
pub mod keychain_manager;
pub mod process_manager;
pub mod sleep_guard;
pub mod status_watcher;
pub mod task_store;

use commands::AppState;
use process_manager::ProcessManager;
use sleep_guard::SleepGuard;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use task_store::TaskStatus;
use tokio::sync::Mutex as AsyncMutex;

fn recover_orphan_processes(store: &mut task_store::TaskStore) {
    use chrono::Utc;
    let tasks = store.list().to_vec();
    for task in tasks {
        if let TaskStatus::Running { run_id, .. } = &task.status {
            tracing::warn!(
                "Orphan process detected: task={} run_id={}. Marking as failed.",
                task.id,
                run_id
            );
            let rid = run_id.clone();
            let _ = store.update(&task.id, |t| {
                t.status = TaskStatus::Failed {
                    run_id: rid,
                    error: "App exited unexpectedly — process lost".into(),
                    failed_at: Utc::now(),
                };
                if let Some(exec) = t.executions.last_mut() {
                    exec.ended_at = Some(Utc::now());
                    exec.outcome = task_store::ExecutionOutcome::Aborted;
                }
            });
        }
    }
    let _ = store.save();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = app_logging::init_logging();

    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("forge-loop-desktop");

    let store_path = data_dir.join("tasks.json");
    let runs_dir = data_dir.join("runs");

    let _ = std::fs::create_dir_all(&runs_dir);

    let mut task_store = task_store::TaskStore::load(&store_path)
        .expect("failed to load task store");

    recover_orphan_processes(&mut task_store);

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
            commands::setup_sudoers,
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

            #[cfg(not(debug_assertions))]
            {
                if !node_bin.exists() || !cli_js.exists() {
                    let msg = format!(
                        "Bundled resources incomplete — cannot start.\nnode={} cli={}",
                        node_bin.exists(),
                        cli_js.exists()
                    );
                    tracing::error!("{}", msg);
                    panic!("{}", msg);
                }
            }

            #[cfg(debug_assertions)]
            {
                if !node_bin.exists() || !cli_js.exists() {
                    eprintln!(
                        "WARNING: Bundled resources incomplete. node={} cli={}",
                        node_bin.exists(),
                        cli_js.exists()
                    );
                }
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            // Setup tray icon with sleep status
            let show_item = MenuItemBuilder::with_id("show", "Show Forge Loop").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("Forge Loop")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Recover stale sleep inhibition from previous crash
            {
                let guard = SleepGuard::new(PathBuf::from("/usr/bin/true"));
                match guard.recover_stale_inhibition() {
                    Ok(true) => tracing::info!("Recovered stale sleep inhibition"),
                    Ok(false) => {}
                    Err(e) => tracing::warn!("Failed to check stale inhibition: {}", e),
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                if let Ok(store) = state.task_store.lock() {
                    let _ = store.save();
                }
                if let Ok(mut sg) = state.sleep_guard.lock() {
                    if let Some(ref guard) = *sg {
                        let _ = guard.disable();
                    }
                    *sg = None;
                }
                tracing::info!("Forge Loop Desktop shutting down");
            }
        });
}
