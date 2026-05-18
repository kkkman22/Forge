use crate::task_store::TaskId;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Emitter;

#[derive(Debug, Serialize, Clone)]
pub struct TaskStatusUpdate {
    pub task_id: TaskId,
    pub phase: Option<String>,
    pub iteration: Option<u32>,
    pub latest_event: Option<String>,
    pub progress_summary: Option<String>,
}

pub struct StatusWatcher {
    watchers: HashMap<TaskId, RecommendedWatcher>,
    app_handle: AppHandle,
}

impl StatusWatcher {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            watchers: HashMap::new(),
            app_handle,
        }
    }

    pub fn watch(
        &mut self,
        task_id: TaskId,
        repo_path: &Path,
        _run_id: &str,
    ) -> Result<(), String> {
        let forge_dir = repo_path.join(".forge");
        if !forge_dir.exists() {
            return Err(format!(
                "forge directory not found: {}",
                forge_dir.display()
            ));
        }

        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(tx)
            .map_err(|e| format!("failed to create watcher: {}", e))?;

        watcher
            .watch(&forge_dir, RecursiveMode::Recursive)
            .map_err(|e| format!("failed to watch: {}", e))?;

        let task_id_clone = task_id.clone();
        let app_handle = self.app_handle.clone();
        let repo_path_owned = repo_path.to_path_buf();

        std::thread::spawn(move || {
            let mut last_emit = std::time::Instant::now();
            let debounce = Duration::from_millis(200);

            loop {
                match rx.recv_timeout(Duration::from_secs(30)) {
                    Ok(_event) => {
                        if last_emit.elapsed() < debounce {
                            continue;
                        }
                        last_emit = std::time::Instant::now();

                        let update = Self::read_status(&repo_path_owned, &task_id_clone);
                        let _ = app_handle.emit("task-status-update", &update);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        self.watchers.insert(task_id, watcher);
        Ok(())
    }

    pub fn unwatch(&mut self, task_id: &TaskId) {
        if let Some(mut watcher) = self.watchers.remove(task_id) {
            let _ = watcher.unwatch(PathBuf::from("/").as_path());
        }
    }

    fn read_status(repo_path: &Path, task_id: &TaskId) -> TaskStatusUpdate {
        let status_path = repo_path.join(".forge/status.md");
        let (phase, iteration) = Self::parse_status_md(&status_path);

        let events_path = Self::find_latest_events(repo_path);
        let latest_event = events_path.and_then(|p| Self::parse_latest_event(&p));

        TaskStatusUpdate {
            task_id: task_id.clone(),
            phase,
            iteration,
            latest_event,
            progress_summary: None,
        }
    }

    pub fn parse_status_md(path: &Path) -> (Option<String>, Option<u32>) {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return (None, None),
        };

        let mut phase = None;
        let mut iteration = None;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("phase:") {
                let val = trimmed
                    .strip_prefix("phase:")
                    .unwrap()
                    .trim()
                    .trim_matches('"')
                    .to_string();
                phase = Some(val);
            } else if trimmed.starts_with("loop_iteration:") {
                let val = trimmed
                    .strip_prefix("loop_iteration:")
                    .unwrap()
                    .trim()
                    .parse::<u32>()
                    .ok();
                iteration = val;
            }
        }

        (phase, iteration)
    }

    fn find_latest_events(repo_path: &Path) -> Option<PathBuf> {
        let runs_dir = repo_path.join(".forge/runs");
        if !runs_dir.exists() {
            return None;
        }

        let mut latest: Option<PathBuf> = None;
        let mut latest_time = std::time::SystemTime::UNIX_EPOCH;

        if let Ok(entries) = std::fs::read_dir(&runs_dir) {
            for entry in entries.flatten() {
                let events_file = entry.path().join("events.ndjson");
                if events_file.exists() {
                    if let Ok(meta) = events_file.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if modified > latest_time {
                                latest_time = modified;
                                latest = Some(events_file);
                            }
                        }
                    }
                }
            }
        }

        latest
    }

    pub fn parse_latest_event(path: &Path) -> Option<String> {
        let content = std::fs::read_to_string(path).ok()?;
        let last_line = content.lines().last()?;
        let parsed: serde_json::Value = serde_json::from_str(last_line).ok()?;
        Some(
            parsed
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or(last_line)
                .to_string(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_parse_status_md_valid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("status.md");
        fs::write(
            &path,
            "---\nphase: \"build\"\nloop_iteration: 7\n---\n# Status",
        )
        .unwrap();
        let (phase, iteration) = StatusWatcher::parse_status_md(&path);
        assert_eq!(phase.as_deref(), Some("build"));
        assert_eq!(iteration, Some(7));
    }

    #[test]
    fn test_parse_status_md_missing_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("status.md");
        fs::write(&path, "---\ncurrent_task: \"test\"\n---\n# Status").unwrap();
        let (phase, iteration) = StatusWatcher::parse_status_md(&path);
        assert_eq!(phase, None);
        assert_eq!(iteration, None);
    }

    #[test]
    fn test_parse_status_md_missing_file() {
        let (phase, iteration) = StatusWatcher::parse_status_md(Path::new("/nonexistent"));
        assert_eq!(phase, None);
        assert_eq!(iteration, None);
    }

    #[test]
    fn test_parse_status_md_malformed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("status.md");
        fs::write(&path, "random garbage content\nno yaml here").unwrap();
        let (phase, iteration) = StatusWatcher::parse_status_md(&path);
        assert_eq!(phase, None);
        assert_eq!(iteration, None);
    }

    #[test]
    fn test_parse_latest_event_valid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("events.ndjson");
        fs::write(
            &path,
            r#"{"phase":"plan","message":"Starting plan"}
{"phase":"build","message":"Building task 1"}"#,
        )
        .unwrap();
        let result = StatusWatcher::parse_latest_event(&path);
        assert_eq!(result.as_deref(), Some("Building task 1"));
    }

    #[test]
    fn test_parse_latest_event_missing_file() {
        let result = StatusWatcher::parse_latest_event(Path::new("/nonexistent"));
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_latest_event_invalid_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("events.ndjson");
        fs::write(&path, "not json at all\nalso not json").unwrap();
        let result = StatusWatcher::parse_latest_event(&path);
        assert_eq!(result, None);
    }
}
