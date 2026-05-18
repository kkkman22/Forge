use forge_loop_desktop_lib::task_store::*;

#[test]
fn test_full_task_lifecycle() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tasks.json");
    let mut store = TaskStore::load(&path).unwrap();

    // Create
    let task = Task {
        id: String::new(),
        title: "Integration test task".into(),
        repo_path: std::path::PathBuf::from("/tmp/test-repo"),
        branch_strategy: BranchStrategy::CurrentBranch,
        target: TaskTarget::Objective {
            text: "Build feature X".into(),
        },
        tier: Some("standard".into()),
        max_iterations: Some(50),
        max_budget_usd: None,
        sleep_inhibit: true,
        status: TaskStatus::Queued,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        executions: Vec::new(),
        metadata: None,
    };
    let id = store.add(task).unwrap();

    // Read
    let task = store.get(&id).unwrap().clone();
    assert_eq!(task.status, TaskStatus::Queued);

    // Start (simulate)
    let run_id = "run-001".to_string();
    store.update(&id, |t| {
        t.status = TaskStatus::Running {
            run_id: run_id.clone(),
            started_at: chrono::Utc::now(),
        };
        t.executions.push(ExecutionRecord {
            run_id: run_id.clone(),
            started_at: chrono::Utc::now(),
            ended_at: None,
            exit_code: None,
            iterations: None,
            outcome: ExecutionOutcome::Pending,
        });
    }).unwrap();

    // Complete (simulate exit code 0)
    store.update(&id, |t| {
        t.status = TaskStatus::AwaitingReview {
            run_id: run_id.clone(),
            completed_at: chrono::Utc::now(),
        };
        if let Some(exec) = t.executions.last_mut() {
            exec.ended_at = Some(chrono::Utc::now());
            exec.exit_code = Some(0);
            exec.iterations = Some(5);
            exec.outcome = ExecutionOutcome::Success;
        }
    }).unwrap();

    // Approve
    let task = store.get(&id).unwrap().clone();
    if let TaskStatus::AwaitingReview { run_id, completed_at } = task.status {
        store.update(&id, |t| {
            t.status = TaskStatus::Completed { run_id, completed_at };
        }).unwrap();
    }

    let task = store.get(&id).unwrap();
    assert!(matches!(task.status, TaskStatus::Completed { .. }));
    assert_eq!(task.executions.len(), 1);
    assert_eq!(task.executions[0].exit_code, Some(0));

    // Verify persistence
    let path_clone = store.store_path().to_path_buf();
    drop(store);
    let store2 = TaskStore::load(&path_clone).unwrap();
    let task2 = store2.get(&id).unwrap();
    assert!(matches!(task2.status, TaskStatus::Completed { .. }));
}

#[test]
fn test_reject_with_feedback() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tasks.json");
    let mut store = TaskStore::load(&path).unwrap();

    let task = Task {
        id: String::new(),
        title: "Test reject".into(),
        repo_path: std::path::PathBuf::from("/tmp/test"),
        branch_strategy: BranchStrategy::CurrentBranch,
        target: TaskTarget::Objective {
            text: "Build feature Y".into(),
        },
        tier: None,
        max_iterations: None,
        max_budget_usd: None,
        sleep_inhibit: true,
        status: TaskStatus::Queued,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        executions: Vec::new(),
        metadata: None,
    };
    let id = store.add(task).unwrap();

    // Simulate reject: prepend feedback to objective
    let feedback = "Fix the pagination";
    store.update(&id, |t| {
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
    }).unwrap();

    let task = store.get(&id).unwrap();
    if let TaskTarget::Objective { text } = &task.target {
        assert!(text.contains("Build feature Y"));
        assert!(text.contains("用户反馈：Fix the pagination"));
    } else {
        panic!("Expected Objective target");
    }
}

#[test]
fn test_orphan_recovery() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tasks.json");
    let mut store = TaskStore::load(&path).unwrap();

    let mut task = Task {
        id: String::new(),
        title: "Orphan".into(),
        repo_path: std::path::PathBuf::from("/tmp/test"),
        branch_strategy: BranchStrategy::CurrentBranch,
        target: TaskTarget::Objective { text: "Do work".into() },
        tier: None,
        max_iterations: None,
        max_budget_usd: None,
        sleep_inhibit: true,
        status: TaskStatus::Running {
            run_id: "stale-run".into(),
            started_at: chrono::Utc::now(),
        },
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        executions: Vec::new(),
        metadata: None,
    };
    task.executions.push(ExecutionRecord {
        run_id: "stale-run".into(),
        started_at: chrono::Utc::now(),
        ended_at: None,
        exit_code: None,
        iterations: None,
        outcome: ExecutionOutcome::Pending,
    });
    let id = store.add(task).unwrap();

    // Simulate orphan recovery (from lib.rs recover_orphan_processes)
    let tasks = store.list().to_vec();
    for t in tasks {
        if let TaskStatus::Running { run_id, .. } = &t.status {
            let rid = run_id.clone();
            store.update(&t.id, |task| {
                task.status = TaskStatus::Failed {
                    run_id: rid,
                    error: "App exited unexpectedly — process lost".into(),
                    failed_at: chrono::Utc::now(),
                };
                if let Some(exec) = task.executions.last_mut() {
                    exec.ended_at = Some(chrono::Utc::now());
                    exec.outcome = ExecutionOutcome::Aborted;
                }
            }).unwrap();
        }
    }

    let recovered = store.get(&id).unwrap();
    assert!(matches!(recovered.status, TaskStatus::Failed { .. }));
    assert_eq!(recovered.executions[0].outcome, ExecutionOutcome::Aborted);
}
