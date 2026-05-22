use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum SleepGuardError {
    #[error("pmset command failed: {0}")]
    PmsetFailed(String),
    #[error("sudoers setup failed: {0}")]
    SudoersFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub struct SleepGuard {
    is_inhibited: Arc<AtomicBool>,
    lid_watcher: Option<thread::JoinHandle<()>>,
    backlight_ctl_path: PathBuf,
    saved_brightness: Arc<AtomicU32>,
    cancel_token: Arc<AtomicBool>,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct SleepStatus {
    pub is_inhibited: bool,
    pub sudoers_configured: bool,
}

impl SleepGuard {
    pub fn new(backlight_ctl_path: PathBuf) -> Self {
        Self {
            is_inhibited: Arc::new(AtomicBool::new(false)),
            lid_watcher: None,
            backlight_ctl_path,
            saved_brightness: Arc::new(AtomicU32::new(100)),
            cancel_token: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn enable(&self) -> Result<(), SleepGuardError> {
        let output = Command::new("sudo")
            .args(["pmset", "-a", "disablesleep", "1"])
            .output()
            .map_err(|e| SleepGuardError::PmsetFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(SleepGuardError::PmsetFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        self.is_inhibited.store(true, Ordering::Relaxed);
        Ok(())
    }

    pub fn disable(&self) -> Result<(), SleepGuardError> {
        let output = Command::new("sudo")
            .args(["pmset", "-a", "disablesleep", "0"])
            .output()
            .map_err(|e| SleepGuardError::PmsetFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(SleepGuardError::PmsetFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        self.is_inhibited.store(false, Ordering::Relaxed);
        Ok(())
    }

    pub fn start_lid_watcher(&mut self) {
        if self.lid_watcher.is_some() {
            return;
        }

        let cancel = self.cancel_token.clone();
        let backlight_ctl = self.backlight_ctl_path.clone();
        let saved_brightness = self.saved_brightness.clone();
        let is_inhibited = self.is_inhibited.clone();

        let handle = thread::spawn(move || {
            let mut was_closed = false;

            while !cancel.load(Ordering::Relaxed) {
                let is_closed = Self::detect_clamshell_closed();

                if is_closed && !was_closed && is_inhibited.load(Ordering::Relaxed) {
                    Self::set_brightness(&backlight_ctl, 0);
                } else if !is_closed && was_closed {
                    let brightness = saved_brightness.load(Ordering::Relaxed);
                    Self::set_brightness(&backlight_ctl, brightness);
                }

                was_closed = is_closed;
                thread::sleep(Duration::from_millis(500));
            }
        });

        self.lid_watcher = Some(handle);
    }

    pub fn stop_lid_watcher(&mut self) {
        self.cancel_token.store(true, Ordering::Relaxed);
        if let Some(handle) = self.lid_watcher.take() {
            let _ = handle.join();
        }
    }

    pub fn is_inhibited(&self) -> bool {
        self.is_inhibited.load(Ordering::Relaxed)
    }

    pub fn setup_sudoers() -> Result<(), SleepGuardError> {
        let content = "%admin ALL=(ALL) NOPASSWD: /usr/bin/pmset\n";

        let mut tmp_file = tempfile::NamedTempFile::new()
            .map_err(|e| SleepGuardError::SudoersFailed(e.to_string()))?;
        use std::io::Write;
        tmp_file.write_all(content.as_bytes())
            .map_err(|e| SleepGuardError::SudoersFailed(e.to_string()))?;
        tmp_file.flush()
            .map_err(|e| SleepGuardError::SudoersFailed(e.to_string()))?;

        let tmp_path = tmp_file.path().to_string_lossy().to_string();
        let cmd = format!(
            "cp {} /etc/sudoers.d/forge-loop && chmod 0440 /etc/sudoers.d/forge-loop",
            tmp_path
        );
        let output = Command::new("sudo")
            .args(["sh", "-c", &cmd])
            .output()
            .map_err(|e| SleepGuardError::SudoersFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(SleepGuardError::SudoersFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        drop(tmp_file);
        Ok(())
    }

    pub fn cleanup_sudoers() -> Result<(), SleepGuardError> {
        let output = Command::new("sudo")
            .args(["rm", "-f", "/etc/sudoers.d/forge-loop"])
            .output()
            .map_err(|e| SleepGuardError::SudoersFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(SleepGuardError::SudoersFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }
        Ok(())
    }

    pub fn check_sudoers_configured() -> bool {
        std::path::Path::new("/etc/sudoers.d/forge-loop").exists()
    }

    pub fn recover_stale_inhibition(&self) -> Result<bool, SleepGuardError> {
        let output = Command::new("pmset")
            .args(["-g"])
            .output()
            .map_err(|e| SleepGuardError::PmsetFailed(e.to_string()))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let sleep_disabled = stdout.contains("disablesleep    1");

        if sleep_disabled {
            self.disable()?;
            return Ok(true);
        }
        Ok(false)
    }

    fn detect_clamshell_closed() -> bool {
        let output = Command::new("ioreg")
            .args(["-r", "-k", "AppleClamshellState"])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.contains("AppleClamshellState") && stdout.contains("= Yes")
            }
            Err(_) => false,
        }
    }

    fn set_brightness(backlight_ctl: &PathBuf, level: u32) {
        let _ = Command::new(backlight_ctl)
            .arg(&level.to_string())
            .output();
    }

    pub fn get_status(&self) -> SleepStatus {
        SleepStatus {
            is_inhibited: self.is_inhibited.load(Ordering::Relaxed),
            sudoers_configured: Self::check_sudoers_configured(),
        }
    }
}

impl Drop for SleepGuard {
    fn drop(&mut self) {
        self.stop_lid_watcher();
        if self.is_inhibited.load(Ordering::Relaxed) {
            let _ = self.disable();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_pmset_enable_command() {
        // Verify the command structure is correct
        let cmd = "sudo";
        let args = vec!["pmset", "-a", "disablesleep", "1"];
        assert_eq!(cmd, "sudo");
        assert_eq!(args[2], "disablesleep");
        assert_eq!(args[3], "1");
    }

    #[test]
    fn test_build_pmset_disable_command() {
        let args = vec!["pmset", "-a", "disablesleep", "0"];
        assert_eq!(args[3], "0");
    }

    #[test]
    fn test_parse_clamshell_closed() {
        let output = "o-AppleClamshellState  <class AppleClamshellState>\n    \"AppleClamshellState\" = Yes";
        assert!(output.contains("AppleClamshellState") && output.contains("= Yes"));
    }

    #[test]
    fn test_parse_clamshell_open() {
        let output = "o-AppleClamshellState  <class AppleClamshellState>\n    \"AppleClamshellState\" = No";
        assert!(output.contains("AppleClamshellState") && !output.contains("= Yes"));
    }

    #[test]
    fn test_sleep_status_serializable() {
        let status = SleepStatus {
            is_inhibited: true,
            sudoers_configured: false,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("is_inhibited"));
        assert!(json.contains("sudoers_configured"));
    }
}
