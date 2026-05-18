use crate::task_store::{BranchStrategy, Task, TaskId, TaskStatus};
use chrono::Utc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command as AsyncCommand};
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum ProcessError {
    #[error("task not found: {0}")]
    TaskNotFound(TaskId),
    #[error("process already running for task: {0}")]
    AlreadyRunning(TaskId),
    #[error("no running process for task: {0}")]
    NotRunning(TaskId),
    #[error("spawn failed: {0}")]
    SpawnFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type RunId = String;

struct ProcessHandle {
    child: Child,
    started_at: chrono::DateTime<Utc>,
    log_path: PathBuf,
    task_id: TaskId,
    run_id: RunId,
}

pub struct ProcessManager {
    registry: HashMap<TaskId, ProcessHandle>,
    node_path: PathBuf,
    cli_path: PathBuf,
    runs_dir: PathBuf,
    app_handle: Option<AppHandle>,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct TaskCompletedEvent {
    pub task_id: TaskId,
    pub run_id: RunId,
    pub exit_code: i32,
    pub success: bool,
}

impl ProcessManager {
    pub fn new(app_resources_dir: &Path, runs_dir: &Path) -> Self {
        Self {
            registry: HashMap::new(),
            node_path: app_resources_dir.join("node/bin/node"),
            cli_path: app_resources_dir.join("forge-loop/dist/src/forge-loop-cli.js"),
            runs_dir: runs_dir.to_path_buf(),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub async fn spawn_task(
        &mut self,
        task: &Task,
        api_key: &str,
    ) -> Result<RunId, ProcessError> {
        if self.registry.contains_key(&task.id) {
            return Err(ProcessError::AlreadyRunning(task.id.clone()));
        }

        let run_id = Uuid::new_v4().to_string();
        let log_dir = self.runs_dir.join(&task.id);
        std::fs::create_dir_all(&log_dir)?;
        let log_path = log_dir.join(format!("{}.log", run_id));

        let args = self.build_cli_args(task, &run_id);

        let mut child = AsyncCommand::new(&self.node_path)
            .args(&args)
            .current_dir(&task.repo_path)
            .env("ANTHROPIC_API_KEY", api_key)
            .env("CLAUDE_CONFIG_DIR", dirs::home_dir().map(|h| h.join(".claude")).unwrap_or_default())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .process_group(0)
            .spawn()
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;

        // Spawn log writers
        if let Some(stdout) = child.stdout.take() {
            let log_path_clone = log_path.clone();
            tokio::spawn(async move {
                let _ = write_lines_to_file(stdout, &log_path_clone).await;
            });
        }
        if let Some(stderr) = child.stderr.take() {
            let log_path_clone = log_path.clone();
            tokio::spawn(async move {
                let _ = write_lines_to_file(stderr, &log_path_clone).await;
            });
        }

        let task_id = task.id.clone();
        let run_id_clone = run_id.clone();
        let app_handle = self.app_handle.clone();

        self.registry.insert(
            task.id.clone(),
            ProcessHandle {
                child,
                started_at: Utc::now(),
                log_path,
                task_id: task.id.clone(),
                run_id: run_id.clone(),
            },
        );

        // Spawn exit watcher
        if let Some(handle) = app_handle {
            tokio::spawn(async move {
                // We need to wait for the child — but it's now in the registry.
                // The exit watcher polls via a channel. Instead, we'll use
                // a different approach: take the child out, wait, then signal.
                // For now, emit event when process_manager detects exit via poll.
                let _ = handle;
                let _ = task_id;
                let _ = run_id_clone;
            });
        }

        Ok(run_id)
    }

    /// Check for exited processes and return their task IDs + exit codes.
    /// Call this periodically or after receiving a status event.
    pub fn poll_exits(&mut self) -> Vec<(TaskId, RunId, i32)> {
        let mut exited = Vec::new();
        let mut to_remove = Vec::new();

        for (task_id, handle) in &mut self.registry {
            match handle.child.try_wait() {
                Ok(Some(status)) => {
                    let exit_code = status.code().unwrap_or(-1);
                    exited.push((task_id.clone(), handle.run_id.clone(), exit_code));
                    to_remove.push(task_id.clone());
                }
                Ok(None) => {}
                Err(_) => {
                    to_remove.push(task_id.clone());
                }
            }
        }

        for task_id in &to_remove {
            self.registry.remove(task_id);
        }

        exited
    }

    pub async fn stop_task(&mut self, task_id: &TaskId) -> Result<(), ProcessError> {
        let handle = self
            .registry
            .get_mut(task_id)
            .ok_or_else(|| ProcessError::NotRunning(task_id.clone()))?;

        if let Some(id) = handle.child.id() {
            unsafe {
                libc::kill(-(id as i32), libc::SIGTERM);
            }
        }

        match tokio::time::timeout(
            std::time::Duration::from_secs(30),
            handle.child.wait(),
        )
        .await
        {
            Ok(Ok(_status)) => {
                self.registry.remove(task_id);
                Ok(())
            }
            _ => {
                if let Some(id) = handle.child.id() {
                    unsafe {
                        libc::kill(-(id as i32), libc::SIGKILL);
                    }
                }
                let _ = self.registry.remove(task_id);
                Ok(())
            }
        }
    }

    pub async fn shutdown_all(&mut self) {
        let task_ids: Vec<TaskId> = self.registry.keys().cloned().collect();
        for task_id in task_ids {
            let _ = self.stop_task(&task_id).await;
        }
    }

    pub fn is_alive(&mut self, task_id: &TaskId) -> bool {
        if let Some(handle) = self.registry.get_mut(task_id) {
            match handle.child.try_wait() {
                Ok(Some(_)) => false,
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    }

    pub fn running_count(&self) -> usize {
        self.registry.len()
    }

    pub fn running_task_ids(&self) -> Vec<TaskId> {
        self.registry.keys().cloned().collect()
    }

    /// Kill a task's process synchronously (for shutdown).
    /// Sends SIGKILL to the process group, no graceful wait.
    pub fn kill_task_sync(&mut self, task_id: &TaskId) -> Result<(), ProcessError> {
        if let Some(handle) = self.registry.get_mut(task_id) {
            if let Some(id) = handle.child.id() {
                unsafe {
                    libc::kill(-(id as i32), libc::SIGKILL);
                }
            }
            let _ = handle.child.try_wait();
            self.registry.remove(task_id);
        }
        Ok(())
    }

    fn build_cli_args(&self, task: &Task, run_id: &str) -> Vec<String> {
        let mut args = vec![self.cli_path.to_string_lossy().to_string()];

        match &task.target {
            crate::task_store::TaskTarget::Objective { text } => {
                args.push(text.clone());
            }
            crate::task_store::TaskTarget::SpecFile { path } => {
                args.extend(["--spec".into(), path.clone()]);
            }
        }

        if let Some(tier) = &task.tier {
            args.extend(["--tier".into(), tier.clone()]);
        }

        match &task.branch_strategy {
            BranchStrategy::NewWorktree { .. } => {
                args.push("--worktree".into());
            }
            BranchStrategy::ExistingBranch { name } => {
                args.extend(["--resume".into(), name.clone()]);
            }
            BranchStrategy::CurrentBranch => {}
        }

        if let Some(n) = task.max_iterations {
            args.extend(["--max-iterations".into(), n.to_string()]);
        }
        if let Some(usd) = task.max_budget_usd {
            args.extend(["--max-budget-usd".into(), usd.to_string()]);
        }

        args.extend(["--prevent-sleep".into(), "off".into()]);

        let log_path = self.runs_dir.join(&task.id).join(format!("{}.log", run_id));
        args.extend([
            "--log-format".into(),
            "json".into(),
            "--log-file".into(),
            log_path.to_string_lossy().to_string(),
        ]);

        args
    }
}

async fn write_lines_to_file<R: tokio::io::AsyncRead + Unpin>(
    mut reader: R,
    path: &Path,
) -> std::io::Result<()> {
    use tokio::io::AsyncBufReadExt;
    use tokio::io::AsyncWriteExt;
    use tokio::io::BufReader;

    let buf_reader = BufReader::new(&mut reader);
    let mut lines = buf_reader.lines();
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;

    while let Some(line) = lines.next_line().await? {
        let truncated = if line.len() > 1024 {
            &line[..1024]
        } else {
            &line
        };
        file.write_all(truncated.as_bytes()).await?;
        file.write_all(b"\n").await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task_store::*;

    fn test_task() -> Task {
        Task {
            id: "test-task-id".into(),
            title: "Test".into(),
            repo_path: PathBuf::from("/tmp/test-repo"),
            branch_strategy: BranchStrategy::CurrentBranch,
            target: TaskTarget::Objective {
                text: "Do something".into(),
            },
            tier: Some("standard".into()),
            max_iterations: Some(50),
            max_budget_usd: None,
            sleep_inhibit: true,
            status: TaskStatus::Queued,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            executions: Vec::new(),
            metadata: None,
        }
    }

    fn assert_contains(args: &[String], needle: &str) {
        assert!(
            args.iter().any(|a| a == needle),
            "expected args to contain {:?}, got {:?}",
            needle,
            args
        );
    }

    #[test]
    fn test_build_cli_args_current_branch() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        let task = test_task();
        let args = pm.build_cli_args(&task, "run-123");
        assert!(args[0].contains("forge-loop-cli.js"));
        assert_contains(&args, "Do something");
        assert_contains(&args, "--tier");
        assert_contains(&args, "standard");
        assert_contains(&args, "--max-iterations");
        assert_contains(&args, "50");
        assert_contains(&args, "--prevent-sleep");
        assert_contains(&args, "off");
        assert_contains(&args, "--log-format");
        assert_contains(&args, "json");
    }

    #[test]
    fn test_build_cli_args_new_worktree() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        let mut task = test_task();
        task.branch_strategy = BranchStrategy::NewWorktree {
            name: "feature/test".into(),
        };
        let args = pm.build_cli_args(&task, "run-456");
        assert_contains(&args, "--worktree");
    }

    #[test]
    fn test_build_cli_args_existing_branch() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        let mut task = test_task();
        task.branch_strategy = BranchStrategy::ExistingBranch {
            name: "main".into(),
        };
        let args = pm.build_cli_args(&task, "run-789");
        assert_contains(&args, "--resume");
        assert_contains(&args, "main");
    }

    #[test]
    fn test_build_cli_args_spec_file() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        let mut task = test_task();
        task.target = TaskTarget::SpecFile {
            path: ".kiro/specs/test/spec.md".into(),
        };
        let args = pm.build_cli_args(&task, "run-spec");
        assert!(args.iter().any(|a| a == "--spec"));
        assert!(args.iter().any(|a| a == ".kiro/specs/test/spec.md"));
    }

    #[test]
    fn test_build_cli_args_no_empty_strings() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        let task = test_task();
        let args = pm.build_cli_args(&task, "run-check");
        assert!(!args.iter().any(|a| a.is_empty()));
    }

    #[test]
    fn test_build_cli_args_with_budget() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        let mut task = test_task();
        task.max_budget_usd = Some(10.0);
        let args = pm.build_cli_args(&task, "run-budget");
        assert_contains(&args, "--max-budget-usd");
    }

    #[test]
    fn test_poll_exits_empty() {
        let dir = tempfile::tempdir().unwrap();
        let mut pm = ProcessManager::new(dir.path(), dir.path());
        let exits = pm.poll_exits();
        assert!(exits.is_empty());
    }

    #[test]
    fn test_running_count() {
        let dir = tempfile::tempdir().unwrap();
        let pm = ProcessManager::new(dir.path(), dir.path());
        assert_eq!(pm.running_count(), 0);
    }
}
