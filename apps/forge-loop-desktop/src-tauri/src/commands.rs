use crate::process_manager::ProcessManager;
use crate::sleep_guard::SleepGuard;
use crate::status_watcher::StatusWatcher;
use crate::task_store::{
    BranchStrategy, ExecutionOutcome, ExecutionRecord, Task, TaskStore, TaskTarget, TaskStatus,
};
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri::State;
use tokio::sync::Mutex as AsyncMutex;

pub struct AppState {
    pub task_store: Mutex<TaskStore>,
    pub process_manager: AsyncMutex<ProcessManager>,
    pub exit_poller_started: std::sync::atomic::AtomicBool,
    pub status_watcher: AsyncMutex<Option<StatusWatcher>>,
    pub sleep_guard: Mutex<Option<SleepGuard>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    pub repo_path: String,
    pub branch_strategy: BranchStrategy,
    pub target: TaskTarget,
    pub tier: Option<String>,
    pub max_iterations: Option<u32>,
    pub max_budget_usd: Option<f64>,
    pub sleep_inhibit: Option<bool>,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct ProcessExitEvent {
    pub task_id: String,
    pub run_id: String,
    pub exit_code: i32,
    pub new_status: String,
}

#[tauri::command]
pub fn create_task(state: State<AppState>, input: TaskInput) -> Result<Task, String> {
    let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
    let task = Task {
        id: String::new(),
        title: input.title,
        repo_path: PathBuf::from(&input.repo_path),
        branch_strategy: input.branch_strategy,
        target: input.target,
        tier: input.tier,
        max_iterations: input.max_iterations,
        max_budget_usd: input.max_budget_usd,
        sleep_inhibit: input.sleep_inhibit.unwrap_or(true),
        status: TaskStatus::Queued,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        executions: Vec::new(),
        metadata: None,
    };
    let id = store.add(task).map_err(|e| e.to_string())?;
    store.add_recent_repo(input.repo_path);
    let _ = store.save();
    store
        .get(&id)
        .cloned()
        .ok_or_else(|| "task not found after creation".into())
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>) -> Result<Vec<Task>, String> {
    let store = state.task_store.lock().map_err(|e| e.to_string())?;
    Ok(store.list().to_vec())
}

#[tauri::command]
pub fn get_task(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let store = state.task_store.lock().map_err(|e| e.to_string())?;
    store
        .get(&task_id)
        .cloned()
        .ok_or_else(|| format!("task not found: {}", task_id))
}

#[tauri::command]
pub fn update_task(
    state: State<AppState>,
    task_id: String,
    patch: TaskInput,
) -> Result<Task, String> {
    let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
    store
        .update(&task_id, |t| {
            t.title = patch.title;
            t.repo_path = PathBuf::from(&patch.repo_path);
            t.branch_strategy = patch.branch_strategy;
            t.target = patch.target;
            t.tier = patch.tier;
            t.max_iterations = patch.max_iterations;
            t.max_budget_usd = patch.max_budget_usd;
            t.sleep_inhibit = patch.sleep_inhibit.unwrap_or(true);
        })
        .map_err(|e| e.to_string())?;
    store
        .get(&task_id)
        .cloned()
        .ok_or_else(|| "task not found after update".into())
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, task_id: String) -> Result<(), String> {
    let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
    store.remove(&task_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_task(
    state: State<AppState>,
    task_id: String,
    new_index: usize,
) -> Result<(), String> {
    let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
    store
        .reorder(&task_id, new_index)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent_repos(state: State<AppState>) -> Result<Vec<String>, String> {
    let store = state.task_store.lock().map_err(|e| e.to_string())?;
    Ok(store.recent_repos().to_vec())
}

// --- Execution Commands ---

fn ensure_exit_poller(app_handle: &tauri::AppHandle, state: &AppState) {
    use std::sync::atomic::Ordering;
    if state.exit_poller_started.swap(true, Ordering::Relaxed) {
        return; // Already started
    }

    let handle = app_handle.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        loop {
            interval.tick().await;

            let state = handle.state::<AppState>();
            let mut pm = state.process_manager.lock().await;
            let exits = pm.poll_exits();
            drop(pm);

            for (tid, rid, exit_code) in exits {
                let mut store = match state.task_store.lock() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let task = store.get(&tid).cloned();
                if let Some(task) = task {
                    let new_status = if exit_code == 0 {
                        TaskStatus::AwaitingReview {
                            run_id: rid.clone(),
                            completed_at: Utc::now(),
                        }
                    } else {
                        TaskStatus::Failed {
                            run_id: rid.clone(),
                            error: format!("Process exited with code {}", exit_code),
                            failed_at: Utc::now(),
                        }
                    };
                    let status_name = match &new_status {
                        TaskStatus::AwaitingReview { .. } => "awaiting_review",
                        TaskStatus::Failed { .. } => "failed",
                        _ => "unknown",
                    };
                    let _ = store.update(&tid, |t| {
                        t.status = new_status;
                        if let Some(exec) = t.executions.last_mut() {
                            exec.ended_at = Some(Utc::now());
                            exec.exit_code = Some(exit_code);
                            exec.outcome = if exit_code == 0 {
                                ExecutionOutcome::Success
                            } else {
                                ExecutionOutcome::Failed(format!("exit code {}", exit_code))
                            };
                        }
                    });
                    let _ = store.save();
                    drop(store);

                    let _ = handle.emit("process-exit", ProcessExitEvent {
                        task_id: tid,
                        run_id: rid,
                        exit_code,
                        new_status: status_name.to_string(),
                    });

                    if exit_code == 0 {
                        let _ = handle.emit("notification-request", serde_json::json!({
                            "title": "Forge Loop 任务完成",
                            "body": task.title,
                        }));
                    }
                }
            }

            // Disable sleep guard when no tasks running
            let running = {
                let pm = state.process_manager.lock().await;
                pm.running_count()
            };
            if running == 0 {
                let sg = match state.sleep_guard.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                if let Some(ref guard) = *sg {
                    let _ = guard.disable();
                }
            }
        }
    });
}

#[tauri::command]
pub async fn start_task(app_handle: tauri::AppHandle, state: State<'_, AppState>, task_id: String) -> Result<String, String> {
    let task = {
        let store = state.task_store.lock().map_err(|e| e.to_string())?;
        store
            .get(&task_id)
            .cloned()
            .ok_or_else(|| format!("task not found: {}", task_id))?
    };

    if matches!(task.branch_strategy, BranchStrategy::CurrentBranch) {
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&task.repo_path)
            .output()
            .map_err(|e| format!("git status failed: {}", e))?;
        if !output.stdout.is_empty() {
            return Err("working tree not clean — commit or stash changes first".into());
        }
    }

    let km = crate::keychain_manager::KeychainManager::new();
    let api_key = km
        .get_api_key()
        .map_err(|e| e.to_string())?
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
        .unwrap_or_default();
    if api_key.is_empty() {
        return Err("ANTHROPIC_API_KEY not set — configure in Settings".into());
    }

    let run_id = {
        let mut pm = state.process_manager.lock().await;
        pm.spawn_task(&task, &api_key)
            .await
            .map_err(|e| e.to_string())?
    };

    {
        let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
        store
            .update(&task_id, |t| {
                t.status = TaskStatus::Running {
                    run_id: run_id.clone(),
                    started_at: Utc::now(),
                };
                t.executions.push(ExecutionRecord {
                    run_id: run_id.clone(),
                    started_at: Utc::now(),
                    ended_at: None,
                    exit_code: None,
                    iterations: None,
                    outcome: ExecutionOutcome::Pending,
                });
            })
            .map_err(|e| e.to_string())?;
    }

    ensure_exit_poller(&app_handle, &state);

    // Start status watcher for this task
    {
        let mut sw_guard = state.status_watcher.lock().await;
        if sw_guard.is_none() {
            *sw_guard = Some(StatusWatcher::new(app_handle.clone()));
        }
        if let Some(ref mut sw) = *sw_guard {
            let _ = sw.watch(task_id.clone(), &task.repo_path, &run_id);
        }
    }

    // Enable sleep guard if task has sleep_inhibit
    if task.sleep_inhibit {
        let mut sg = state.sleep_guard.lock().map_err(|e| e.to_string())?;
        if sg.is_none() {
            let guard = SleepGuard::new(std::path::PathBuf::from("/usr/bin/true"));
            if let Err(e) = guard.enable() {
                tracing::warn!("Failed to enable sleep guard: {}", e);
            }
            *sg = Some(guard);
        }
    }

    Ok(run_id)
}

#[tauri::command]
pub async fn stop_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let mut pm = state.process_manager.lock().await;
    pm.stop_task(&task_id).await.map_err(|e| e.to_string())?;

    let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
    store
        .update(&task_id, |t| {
            t.status = TaskStatus::Paused;
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn retry_task(state: State<'_, AppState>, task_id: String) -> Result<String, String> {
    {
        let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
        store
            .update(&task_id, |t| {
                t.status = TaskStatus::Queued;
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(task_id)
}

// --- Auth Commands ---

#[tauri::command]
pub async fn store_api_key(key: String) -> Result<bool, String> {
    let km = crate::keychain_manager::KeychainManager::new();
    km.validate_api_key(&key).await?;
    km.store_api_key(&key)?;
    Ok(true)
}

#[tauri::command]
pub fn get_auth_status() -> Result<crate::keychain_manager::AuthStatus, String> {
    let km = crate::keychain_manager::KeychainManager::new();
    Ok(km.get_auth_status())
}

#[tauri::command]
pub fn clear_credentials() -> Result<(), String> {
    let km = crate::keychain_manager::KeychainManager::new();
    km.delete_api_key()
}

// --- Sleep Commands ---

#[tauri::command]
pub fn get_sleep_status() -> Result<crate::sleep_guard::SleepStatus, String> {
    let guard = crate::sleep_guard::SleepGuard::new(std::path::PathBuf::from("/usr/bin/true"));
    Ok(guard.get_status())
}

#[tauri::command]
pub fn toggle_sleep_inhibit(enabled: bool) -> Result<(), String> {
    let guard = crate::sleep_guard::SleepGuard::new(std::path::PathBuf::from("/usr/bin/true"));
    if enabled {
        guard.enable().map_err(|e| e.to_string())
    } else {
        guard.disable().map_err(|e| e.to_string())
    }
}

// --- Review Commands ---

#[tauri::command]
pub fn approve_task(state: State<AppState>, task_id: String) -> Result<(), String> {
    let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
    let task = store
        .get(&task_id)
        .cloned()
        .ok_or_else(|| format!("task not found: {}", task_id))?;

    let (run_id, completed_at) = match &task.status {
        TaskStatus::AwaitingReview { run_id, completed_at } => {
            (run_id.clone(), *completed_at)
        }
        _ => return Err("task is not awaiting review".into()),
    };

    store
        .update(&task_id, |t| {
            t.status = TaskStatus::Completed { run_id, completed_at };
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reject_task(
    state: State<'_, AppState>,
    task_id: String,
    feedback: String,
) -> Result<String, String> {
    {
        let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
        store
            .update(&task_id, |t| {
                match &t.target {
                    TaskTarget::Objective { text } => {
                        t.target = TaskTarget::Objective {
                            text: format!("{}\n---\n用户反馈：{}", text, feedback),
                        };
                    }
                    TaskTarget::SpecFile { path } => {
                        t.target = TaskTarget::Objective {
                            text: format!("Spec: {}\n---\n用户反馈：{}", path, feedback),
                        };
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    }
    retry_task(state, task_id).await
}

#[tauri::command]
pub fn get_diff(task_id: String, repo_path: String) -> Result<String, String> {
    let _ = task_id;
    let output = std::process::Command::new("git")
        .args(["diff", "HEAD~1", "--stat"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("git diff failed: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn get_task_log(
    task_id: String,
    run_id: String,
    lines: usize,
) -> Result<String, String> {
    let data_dir = dirs::data_dir()
        .unwrap_or_default()
        .join("forge-loop-desktop")
        .join("runs")
        .join(&task_id)
        .join(format!("{}.log", run_id));

    if !data_dir.exists() {
        return Ok(String::new());
    }

    let content = std::fs::read_to_string(&data_dir)
        .map_err(|e| format!("failed to read log: {}", e))?;

    let all_lines: Vec<&str> = content.lines().collect();
    let start = all_lines.len().saturating_sub(lines);
    Ok(all_lines[start..].join("\n"))
}

// --- System Commands ---

#[tauri::command]
pub fn export_diagnostics() -> Result<String, String> {
    let path = crate::app_logging::export_diagnostics()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn check_update() -> Result<Option<String>, String> {
    Ok(None)
}
