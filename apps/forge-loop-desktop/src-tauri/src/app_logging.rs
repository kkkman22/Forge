use std::fs;
use std::path::PathBuf;
use std::process::Command as StdCommand;

use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::EnvFilter;

pub fn init_logging() -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = dirs::home_dir()
        .map(|h| h.join("Library/Logs/forge-loop-desktop"))
        .unwrap_or_else(|| PathBuf::from("logs"));

    fs::create_dir_all(&log_dir)?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "app.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    std::mem::forget(_guard);

    let subscriber = tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(non_blocking)
        .with_span_events(FmtSpan::CLOSE)
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;

    tracing::info!("Forge Loop Desktop starting");
    tracing::info!("Log directory: {}", log_dir.display());

    Ok(())
}

pub fn export_diagnostics() -> Result<PathBuf, String> {
    let log_dir = dirs::home_dir()
        .map(|h| h.join("Library/Logs/forge-loop-desktop"))
        .ok_or("cannot determine log directory")?;

    let data_dir = dirs::data_dir()
        .map(|d| d.join("forge-loop-desktop"))
        .ok_or("cannot determine data directory")?;

    let output_path = data_dir.join("diagnostics.zip");

    // Collect files for the diagnostics package
    let mut files_to_include: Vec<PathBuf> = Vec::new();

    if log_dir.exists() {
        if let Ok(entries) = fs::read_dir(&log_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "log") {
                    files_to_include.push(path);
                }
            }
        }
    }

    let tasks_json = data_dir.join("tasks.json");
    if tasks_json.exists() {
        files_to_include.push(tasks_json);
    }

    tracing::info!(
        "Exporting diagnostics: {} files",
        files_to_include.len()
    );

    // Remove old diagnostics.zip
    let _ = fs::remove_file(&output_path);

    // Use system `zip` command to create archive
    let mut cmd = StdCommand::new("zip");
    cmd.arg("-j").arg(&output_path);

    for file in &files_to_include {
        cmd.arg(file);
    }

    let output = cmd.output().map_err(|e| format!("zip command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("zip failed: {}", stderr));
    }

    Ok(output_path)
}
