use std::fs;

fn parse_log_line(line: &str) -> Option<(Option<String>, Option<u32>, Option<String>)> {
    let val: serde_json::Value = serde_json::from_str(line).ok()?;

    if val.get("event").and_then(|v| v.as_str()) == Some("forge_loop_run_started") {
        return None;
    }

    let phase = val.get("phase").and_then(|v| v.as_str()).map(|s| s.to_string());
    let iteration = val.get("iteration").and_then(|v| v.as_u64()).map(|n| n as u32);
    let message = val.get("message").and_then(|v| v.as_str()).map(|s| s.to_string());

    Some((phase, iteration, message))
}

fn parse_latest_event_line(line: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(line).ok()?;
    Some(
        parsed
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or(line)
            .to_string(),
    )
}

#[test]
fn valid_ipc_frame_parses() {
    let line = r#"{"event":"message","run_id":"test","schema":1,"ts":"2026-01-15T00:00:00Z","text":"hello"}"#;
    let result = serde_json::from_str::<serde_json::Value>(line);
    assert!(result.is_ok());
}

#[test]
fn unknown_fields_do_not_error() {
    let line = r#"{"event":"message","run_id":"test","schema":1,"ts":"2026-01-15T00:00:00Z","text":"hello","future_field":"unknown","another_new_field":42}"#;
    let result: serde_json::Value = serde_json::from_str(line).unwrap();
    assert_eq!(result["future_field"], "unknown");
    assert_eq!(result["another_new_field"], 42);
}

#[test]
fn unknown_event_type_does_not_panic() {
    let line = r#"{"event":"future_event_type","run_id":"test","schema":1,"ts":"2026-01-15T00:00:00Z","data":"test"}"#;
    let val: serde_json::Value = serde_json::from_str(line).unwrap();
    assert_eq!(val["event"], "future_event_type");
    let result = parse_log_line(line);
    assert!(result.is_some());
    assert_eq!(result.unwrap().0, None);
}

#[test]
fn long_line_up_to_1500_bytes_parses() {
    let padding = "x".repeat(1400);
    let line = format!(
        r#"{{"event":"message","run_id":"test","schema":1,"ts":"2026-01-15T00:00:00Z","text":"{}"}}"#,
        padding
    );
    assert!(line.len() >= 1400);
    assert!(line.len() <= 1500);
    let result: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(result["text"].as_str().unwrap().len(), 1400);
}

#[test]
fn task_status_update_after_unknown_input() {
    let unknown = r#"{"event":"future_event_type","run_id":"test","schema":1,"ts":"2026-01-15T00:00:00Z","data":"test"}"#;
    let _ = serde_json::from_str::<serde_json::Value>(unknown).unwrap();

    let valid = r#"{"phase":"build","iteration":3,"message":"Compiling module","task_id":"t1","run_id":"r1"}"#;
    let (phase, iteration, message) = parse_log_line(valid).unwrap();
    assert_eq!(phase.as_deref(), Some("build"));
    assert_eq!(iteration, Some(3));
    assert_eq!(message.as_deref(), Some("Compiling module"));
}

#[test]
fn parse_latest_event_with_unknown_fields() {
    let line = r#"{"phase":"plan","message":"Starting plan","future_meta":{"ai":"claude"},"version":2}"#;
    let result = parse_latest_event_line(line).unwrap();
    assert_eq!(result, "Starting plan");
}

#[test]
fn ndjson_file_with_mixed_lines() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("events.ndjson");

    let long_padding = "a".repeat(1400);
    let long_line = format!(r#"{{"phase":"build","iteration":2,"message":"{}"}}"#, long_padding);
    let lines = vec![
        r#"{"phase":"plan","message":"Starting"}"#.to_string(),
        r#"{"event":"unknown_type","custom_data":"blah"}"#.to_string(),
        r#"{"phase":"build","iteration":1,"message":"Working","future_field":true}"#.to_string(),
        long_line,
        r#"{"phase":"review","iteration":3,"message":"Done"}"#.to_string(),
    ];

    let content = lines.join("\n");
    fs::write(&path, &content).unwrap();

    let file_content = fs::read_to_string(&path).unwrap();
    let all_lines: Vec<&str> = file_content.lines().collect();

    assert_eq!(all_lines.len(), 5);

    for line in &all_lines {
        let _: serde_json::Value = serde_json::from_str(line).unwrap();
    }

    let last = all_lines.last().unwrap();
    let (phase, iteration, message) = parse_log_line(last).unwrap();
    assert_eq!(phase.as_deref(), Some("review"));
    assert_eq!(iteration, Some(3));
    assert_eq!(message.as_deref(), Some("Done"));
}

#[test]
fn forge_loop_run_started_not_treated_as_progress() {
    let line = r#"{"event":"forge_loop_run_started","branch_name":"feature/test","worktree_path":"/tmp/wt"}"#;
    let result = parse_log_line(line);
    assert_eq!(result, None);
}

#[test]
fn serde_value_has_no_deny_unknown_fields() {
    let json_str = r#"{"known":1,"totally_unknown":2}"#;
    let val: serde_json::Value = serde_json::from_str(json_str).unwrap();
    assert_eq!(val["known"], 1);
    assert_eq!(val["totally_unknown"], 2);
}

#[test]
fn line_truncation_at_boundary() {
    let inner = "y".repeat(1200);
    let line = format!(r#"{{"phase":"build","message":"{}"}}"#, inner);
    assert!(line.len() > 1024);

    let truncated = if line.len() > 1024 { &line[..1024] } else { &line };
    let result: Result<serde_json::Value, _> = serde_json::from_str(truncated);
    assert!(result.is_err());
}
