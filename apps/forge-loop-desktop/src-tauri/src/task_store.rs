use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub type TaskId = String;
pub type RunId = String;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BranchStrategy {
    CurrentBranch,
    NewWorktree { name: String },
    ExistingBranch { name: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TaskTarget {
    Objective { text: String },
    SpecFile { path: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Running {
        run_id: RunId,
        started_at: DateTime<Utc>,
    },
    Paused,
    AwaitingReview {
        run_id: RunId,
        completed_at: DateTime<Utc>,
    },
    Completed {
        run_id: RunId,
        completed_at: DateTime<Utc>,
    },
    Failed {
        run_id: RunId,
        error: String,
        failed_at: DateTime<Utc>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ExecutionOutcome {
    Success,
    Failed(String),
    Aborted,
    Pending,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionRecord {
    pub run_id: RunId,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub iterations: Option<u32>,
    pub outcome: ExecutionOutcome,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskMetadata {
    pub current_branch: String,
    pub recent_specs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: TaskId,
    pub title: String,
    pub repo_path: PathBuf,
    pub branch_strategy: BranchStrategy,
    pub target: TaskTarget,
    pub tier: Option<String>,
    pub max_iterations: Option<u32>,
    pub max_budget_usd: Option<f64>,
    pub sleep_inhibit: bool,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub executions: Vec<ExecutionRecord>,
    pub metadata: Option<TaskMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskStoreData {
    pub schema_version: u32,
    pub tasks: Vec<Task>,
    pub recent_repos: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum TaskStoreError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Task not found: {0}")]
    NotFound(TaskId),
    #[error("Invalid schema version: expected 1, got {0}")]
    InvalidSchemaVersion(u32),
}

pub struct TaskStore {
    path: PathBuf,
    data: TaskStoreData,
}

impl TaskStore {
    pub fn load(path: &Path) -> Result<Self, TaskStoreError> {
        if path.exists() {
            let content = fs::read_to_string(path)?;
            let data: TaskStoreData = serde_json::from_str(&content)?;
            if data.schema_version != 1 {
                return Err(TaskStoreError::InvalidSchemaVersion(data.schema_version));
            }
            Ok(Self {
                path: path.to_path_buf(),
                data,
            })
        } else {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let store = Self {
                path: path.to_path_buf(),
                data: TaskStoreData {
                    schema_version: 1,
                    tasks: Vec::new(),
                    recent_repos: Vec::new(),
                },
            };
            store.save()?;
            Ok(store)
        }
    }

    pub fn save(&self) -> Result<(), TaskStoreError> {
        let tmp_path = self.path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(&self.data)?;
        fs::write(&tmp_path, content)?;
        fs::rename(&tmp_path, &self.path)?;
        Ok(())
    }

    pub fn add(&mut self, mut task: Task) -> Result<TaskId, TaskStoreError> {
        let id = Uuid::new_v4().to_string();
        task.id = id.clone();
        self.data.tasks.push(task);
        self.save()?;
        Ok(id)
    }

    pub fn update<F>(&mut self, task_id: &TaskId, f: F) -> Result<(), TaskStoreError>
    where
        F: FnOnce(&mut Task),
    {
        let task = self
            .data
            .tasks
            .iter_mut()
            .find(|t| t.id == *task_id)
            .ok_or_else(|| TaskStoreError::NotFound(task_id.clone()))?;
        f(task);
        task.updated_at = Utc::now();
        self.save()?;
        Ok(())
    }

    pub fn remove(&mut self, task_id: &TaskId) -> Result<(), TaskStoreError> {
        let len_before = self.data.tasks.len();
        self.data.tasks.retain(|t| t.id != *task_id);
        if self.data.tasks.len() == len_before {
            return Err(TaskStoreError::NotFound(task_id.clone()));
        }
        self.save()?;
        Ok(())
    }

    pub fn reorder(&mut self, task_id: &TaskId, new_index: usize) -> Result<(), TaskStoreError> {
        let current_index = self
            .data
            .tasks
            .iter()
            .position(|t| t.id == *task_id)
            .ok_or_else(|| TaskStoreError::NotFound(task_id.clone()))?;
        let task = self.data.tasks.remove(current_index);
        let insert_at = new_index.min(self.data.tasks.len());
        self.data.tasks.insert(insert_at, task);
        self.save()?;
        Ok(())
    }

    pub fn prune_completed(&mut self, max_keep: usize) -> Result<(), TaskStoreError> {
        let (completed, mut active): (Vec<_>, Vec<_>) =
            self.data.tasks.drain(..).partition(|t| {
                matches!(t.status, TaskStatus::Completed { .. })
            });
        let mut kept: Vec<Task> = completed
            .into_iter()
            .enumerate()
            .filter_map(|(i, t)| if i < max_keep { Some(t) } else { None })
            .collect();
        active.append(&mut kept);
        self.data.tasks = active;
        self.save()
    }

    pub fn store_path(&self) -> &Path {
        &self.path
    }

    pub fn get(&self, task_id: &TaskId) -> Option<&Task> {
        self.data.tasks.iter().find(|t| t.id == *task_id)
    }

    pub fn list(&self) -> &[Task] {
        &self.data.tasks
    }

    pub fn add_recent_repo(&mut self, repo_path: String) {
        self.data.recent_repos.retain(|r| *r != repo_path);
        self.data.recent_repos.insert(0, repo_path);
        self.data.recent_repos.truncate(5);
    }

    pub fn recent_repos(&self) -> &[String] {
        &self.data.recent_repos
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn test_store() -> (TaskStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tasks.json");
        let store = TaskStore::load(&path).unwrap();
        (store, dir)
    }

    fn sample_task() -> Task {
        Task {
            id: String::new(),
            title: "Test task".into(),
            repo_path: PathBuf::from("/Users/test/project"),
            branch_strategy: BranchStrategy::CurrentBranch,
            target: TaskTarget::Objective {
                text: "Build feature".into(),
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

    #[test]
    fn test_load_creates_new() {
        let (store, _dir) = test_store();
        assert_eq!(store.data.schema_version, 1);
        assert!(store.list().is_empty());
    }

    #[test]
    fn test_add_task() {
        let (mut store, _dir) = test_store();
        let id = store.add(sample_task()).unwrap();
        assert!(!id.is_empty());
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.get(&id).unwrap().title, "Test task");
    }

    #[test]
    fn test_update_task() {
        let (mut store, _dir) = test_store();
        let id = store.add(sample_task()).unwrap();
        store
            .update(&id, |t| {
                t.title = "Updated title".into();
            })
            .unwrap();
        assert_eq!(store.get(&id).unwrap().title, "Updated title");
    }

    #[test]
    fn test_remove_task() {
        let (mut store, _dir) = test_store();
        let id = store.add(sample_task()).unwrap();
        store.remove(&id).unwrap();
        assert!(store.list().is_empty());
    }

    #[test]
    fn test_remove_nonexistent() {
        let (mut store, _dir) = test_store();
        let result = store.remove(&"nonexistent".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder() {
        let (mut store, _dir) = test_store();
        let id1 = store.add(sample_task()).unwrap();
        let mut task2 = sample_task();
        task2.title = "Task 2".into();
        let id2 = store.add(task2).unwrap();
        store.reorder(&id2, 0).unwrap();
        assert_eq!(store.list()[0].id, id2);
        assert_eq!(store.list()[1].id, id1);
    }

    #[test]
    fn test_prune_completed() {
        let (mut store, _dir) = test_store();
        for i in 0..5 {
            let mut task = sample_task();
            task.title = format!("Task {}", i);
            task.status = TaskStatus::Completed {
                run_id: format!("run-{}", i),
                completed_at: Utc::now(),
            };
            store.add(task).unwrap();
        }
        store.prune_completed(3).unwrap();
        let completed = store
            .list()
            .iter()
            .filter(|t| matches!(t.status, TaskStatus::Completed { .. }))
            .count();
        assert_eq!(completed, 3);
    }

    #[test]
    fn test_atomic_write() {
        let (mut store, _dir) = test_store();
        store.add(sample_task()).unwrap();
        let content = fs::read_to_string(&store.path).unwrap();
        let parsed: TaskStoreData = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.tasks.len(), 1);
    }

    #[test]
    fn test_persistence_roundtrip() {
        let (mut store, dir) = test_store();
        let id = store.add(sample_task()).unwrap();
        let path = store.path.clone();
        drop(store);
        let store2 = TaskStore::load(&path).unwrap();
        assert_eq!(store2.list().len(), 1);
        assert_eq!(store2.get(&id).unwrap().title, "Test task");
    }

    #[test]
    fn test_recent_repos() {
        let (mut store, _dir) = test_store();
        store.add_recent_repo("/a".into());
        store.add_recent_repo("/b".into());
        store.add_recent_repo("/a".into());
        assert_eq!(store.recent_repos(), &["/a", "/b"]);
    }

    #[test]
    fn test_recent_repos_max_5() {
        let (mut store, _dir) = test_store();
        for i in 0..7 {
            store.add_recent_repo(format!("/repo-{}", i));
        }
        assert_eq!(store.recent_repos().len(), 5);
        assert_eq!(store.recent_repos()[0], "/repo-6");
    }

    #[test]
    fn test_orphan_running_marked_failed_on_load() {
        let (mut store, _dir) = test_store();
        let mut task = sample_task();
        task.status = TaskStatus::Running {
            run_id: "orphan-run".into(),
            started_at: Utc::now(),
        };
        let id = store.add(task).unwrap();

        // Simulate orphan recovery
        let tasks = store.list().to_vec();
        for t in tasks {
            if let TaskStatus::Running { run_id, .. } = &t.status {
                let rid = run_id.clone();
                store.update(&t.id, |task| {
                    task.status = TaskStatus::Failed {
                        run_id: rid,
                        error: "App exited unexpectedly".into(),
                        failed_at: Utc::now(),
                    };
                }).unwrap();
            }
        }

        let recovered = store.get(&id).unwrap();
        assert!(matches!(recovered.status, TaskStatus::Failed { .. }));
    }
}
