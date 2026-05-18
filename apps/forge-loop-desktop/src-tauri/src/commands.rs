use crate::process_manager::ProcessManager;
use crate::task_store::{
    BranchStrategy, ExecutionOutcome, ExecutionRecord, Task, TaskStore, TaskTarget, TaskStatus,
};
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use tokio::sync::Mutex as AsyncMutex;

pub struct AppState {
    pub task_store: Mutex<TaskStore>,
    pub process_manager: AsyncMutex<ProcessManager>,
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

#[tauri::command]
pub async fn start_task(state: State<'_, AppState>, task_id: String) -> Result<String, String> {
    let task = {
        let store = state.task_store.lock().map_err(|e| e.to_string())?;
        store
            .get(&task_id)
            .cloned()
            .ok_or_else(|| format!("task not found: {}", task_id))?
    };

    // Validate git status for current_branch strategy
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

    // Read API key from KeychainManager
    let km = crate::keychain_manager::KeychainManager::new();
    let api_key = km
        .get_api_key()
        .map_err(|e| e.to_string())?
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
        .unwrap_or_default();
    if api_key.is_empty() {
        return Err("ANTHROPIC_API_KEY not set — configure in Settings".into());
    }

    let mut pm = state.process_manager.lock().await;
    let run_id = pm
        .spawn_task(&task, &api_key)
        .await
        .map_err(|e| e.to_string())?;

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
    // Reset to queued status, then start
    {
        let mut store = state.task_store.lock().map_err(|e| e.to_string())?;
        store
            .update(&task_id, |t| {
                t.status = TaskStatus::Queued;
            })
            .map_err(|e| e.to_string())?;
    }
    start_task(state, task_id).await
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
                // Prepend feedback to objective
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
    // Stub: check GitHub Releases API for latest version
    Ok(None)
}
