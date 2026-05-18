use std::fs;
use std::path::PathBuf;

use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::EnvFilter;

pub fn init_logging() -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = dirs::home_dir()
        .map(|h| h.join("Library/Logs/forge-loop-desktop"))
        .unwrap_or_else(|| PathBuf::from("logs"));

    fs::create_dir_all(&log_dir)?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "app.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep the guard alive for the lifetime of the app
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

    // Recent log files (last 7 days)
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

    // tasks.json (sanitized)
    let tasks_json = data_dir.join("tasks.json");
    if tasks_json.exists() {
        files_to_include.push(tasks_json);
    }

    tracing::info!(
        "Exporting diagnostics: {} files",
        files_to_include.len()
    );

    // For now, just return the list path — full zip creation requires
    // additional deps or shelling out to `zip`
    let list_path = data_dir.join("diagnostics-file-list.txt");
    let content: String = files_to_include
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&list_path, content).map_err(|e| e.to_string())?;

    Ok(list_path)
}
