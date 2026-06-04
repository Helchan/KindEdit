use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq)]
pub enum SystemTheme {
    Light,
    Dark,
    Unknown,
}

/// Detect the current system theme.
/// - macOS: reads `defaults read -g AppleInterfaceStyle`
/// - Windows: reads registry key
/// - Other: returns Unknown
pub fn detect_system_theme() -> SystemTheme {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output();
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.trim().eq_ignore_ascii_case("dark") {
                    SystemTheme::Dark
                } else {
                    SystemTheme::Light
                }
            }
            Err(_) => SystemTheme::Light, // Command fails means no dark mode set
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v",
                "AppsUseLightTheme",
            ])
            .output();
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // Value 0 means dark theme, 1 means light theme
                if stdout.contains("0x0") {
                    SystemTheme::Dark
                } else {
                    SystemTheme::Light
                }
            }
            Err(_) => SystemTheme::Unknown,
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        SystemTheme::Unknown
    }
}

/// Get the application configuration directory using the `dirs` crate.
/// - macOS: ~/Library/Application Support/KindEdit/
/// - Windows: %APPDATA%\KindEdit\
/// - Linux: $XDG_CONFIG_HOME/KindEdit/ or ~/.config/KindEdit/
pub fn get_config_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("KindEdit")
}

/// Get the platform-specific modifier key name.
/// - macOS: "Command"
/// - Windows/Linux: "Ctrl"
pub fn get_modifier_key() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Command"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_system_theme_no_panic() {
        let theme = detect_system_theme();
        // Just ensure it doesn't panic and returns a valid variant
        match theme {
            SystemTheme::Light | SystemTheme::Dark | SystemTheme::Unknown => {}
        }
    }

    #[test]
    fn test_get_config_dir() {
        let dir = get_config_dir();
        assert!(dir.ends_with("KindEdit"));
    }

    #[test]
    fn test_get_modifier_key() {
        let key = get_modifier_key();
        assert!(!key.is_empty());
        #[cfg(target_os = "macos")]
        assert_eq!(key, "Command");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(key, "Ctrl");
    }
}
