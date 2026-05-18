use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

const SERVICE: &str = "forge-loop-desktop";
const ACCOUNT: &str = "anthropic-api-key";

#[derive(Debug, serde::Serialize, Clone)]
pub struct AuthStatus {
    pub mode: String,
    pub is_valid: bool,
}

pub struct KeychainManager;

impl KeychainManager {
    pub fn new() -> Self {
        Self
    }

    pub fn store_api_key(&self, key: &str) -> Result<(), String> {
        set_generic_password(SERVICE, ACCOUNT, key.as_bytes())
            .map_err(|e| format!("failed to store API key: {}", e))
    }

    pub fn get_api_key(&self) -> Result<Option<String>, String> {
        match get_generic_password(SERVICE, ACCOUNT) {
            Ok(password) => {
                let key = String::from_utf8(password)
                    .map_err(|e| format!("invalid UTF-8 in stored key: {}", e))?;
                Ok(Some(key))
            }
            Err(_) => Ok(None),
        }
    }

    pub fn delete_api_key(&self) -> Result<(), String> {
        delete_generic_password(SERVICE, ACCOUNT)
            .map_err(|e| format!("failed to delete API key: {}", e))
    }

    pub fn detect_claude_code_session(&self) -> bool {
        let home = dirs::home_dir().unwrap_or_default();
        let credentials = home.join(".claude/.credentials.json");
        credentials.exists()
    }

    pub fn get_auth_status(&self) -> AuthStatus {
        if let Ok(Some(_)) = self.get_api_key() {
            return AuthStatus {
                mode: "api_key".into(),
                is_valid: true,
            };
        }

        if self.detect_claude_code_session() {
            return AuthStatus {
                mode: "claude_code_session".into(),
                is_valid: true,
            };
        }

        AuthStatus {
            mode: "none".into(),
            is_valid: false,
        }
    }

    pub async fn validate_api_key(&self, key: &str) -> Result<bool, String> {
        let client = reqwest::Client::new();
        let response = client
            .get("https://api.anthropic.com/v1/messages?limit=1")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
            .map_err(|e| format!("validation request failed: {}", e))?;

        match response.status().as_u16() {
            200 | 400 => Ok(true), // 400 = valid key, bad params
            401 => Ok(false),
            status => Err(format!("unexpected status: {}", status)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_claude_code_session_nonexistent() {
        // This tests the function doesn't panic on missing dir
        let km = KeychainManager::new();
        // Result depends on whether ~/.claude/.credentials.json exists
        let _ = km.detect_claude_code_session();
    }

    #[test]
    fn test_get_auth_status_returns_valid_structure() {
        let km = KeychainManager::new();
        let status = km.get_auth_status();
        assert!(matches!(
            status.mode.as_str(),
            "none" | "api_key" | "claude_code_session"
        ));
    }
}
