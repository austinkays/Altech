use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use rfd::FileDialog;
use tauri::{AppHandle, Emitter};

#[tauri::command]
fn open_file_dialog() -> Option<String> {
    FileDialog::new()
        .add_filter("PDF Documents", &["pdf"])
        .add_filter("Images", &["png", "jpg", "jpeg", "heic", "tiff", "webp"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn process_policy_file(file_path: String) -> String {
    println!("Rust received file: {}", file_path);

    // 1. Run the Python script
    // Note: We use ".." because the Rust app runs inside 'src-tauri',
    // so we need to go up one level to find 'python_backend'.
    let output = Command::new("python")
        .arg("../python_backend/policy_engine.py")
        .arg(&file_path)
        .output();

    // 2. Handle the result
    match output {
        Ok(o) => {
            if o.status.success() {
                let text = String::from_utf8_lossy(&o.stdout).to_string();
                println!("Python Success! Extracted {} chars.", text.len());
                text // Return the text to the UI
            } else {
                let error = String::from_utf8_lossy(&o.stderr).to_string();
                println!("Python Error: {}", error);
                format!("Error: {}", error)
            }
        }
        Err(e) => {
            println!("Failed to execute command: {}", e);
            format!("Execution failed: {}", e)
        }
    }
}

// run_ezlynx_filler: spawn the Python EZLynx filler with the user's client
// JSON, stream its stdout line-by-line back to the frontend via Tauri events,
// and return a summary on completion.
//
// Frontend invokes:    invoke("run_ezlynx_filler", { clientJson: "..." })
// Frontend listens to: event "ezlynx-progress" — payload = each Python stdout line
//
// We accept the JSON as a string instead of a path so the frontend doesn't
// need fs permissions; we write a temp file ourselves. The temp file is
// removed on success and kept on error so the user can re-run for debugging.
#[tauri::command]
async fn run_ezlynx_filler(
    client_json: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join("altech-ezlynx-client.json");
    std::fs::write(&temp_path, &client_json)
        .map_err(|e| format!("Failed to write client JSON: {}", e))?;

    let script_path = "../python_backend/ezlynx_filler.py";
    let schema_path = "../ezlynx_schema.json";

    let mut child = Command::new("python")
        // -u forces unbuffered stdout. Without this, Python block-buffers
        // when stdout is piped (4KB+ before flush), so the startup lines
        // ("Loaded client data", "Toolbar injected") don't reach the frontend
        // until the script writes a lot more. Result: modal looks frozen.
        .arg("-u")
        .arg(script_path)
        .arg("--client")
        .arg(&temp_path)
        .arg("--schema")
        .arg(schema_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Python ({}): {}", script_path, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture Python stdout".to_string())?;

    // Stream stdout line-by-line and emit each line as an "ezlynx-progress"
    // event. BufReader::lines() blocks the calling task, but Tauri runs async
    // commands on a worker thread so the UI thread stays responsive.
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        match line {
            Ok(text) => {
                let _ = app_handle.emit("ezlynx-progress", &text);
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "ezlynx-progress",
                    format!("[!] Read error: {}", e),
                );
                break;
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for Python: {}", e))?;

    let stderr_text = if let Some(mut err) = child.stderr.take() {
        let mut buf = String::new();
        let _ = err.read_to_string(&mut buf);
        buf
    } else {
        String::new()
    };

    if status.success() {
        let _ = std::fs::remove_file(&temp_path);
        Ok(format!(
            "Filler completed (exit code {}).",
            status.code().unwrap_or(0)
        ))
    } else {
        Err(format!(
            "Filler exited with code {}.\n\nStderr:\n{}\n\nClient JSON kept at: {}",
            status.code().unwrap_or(-1),
            stderr_text.trim(),
            temp_path.display()
        ))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .on_window_event(|window, event| {
        if let tauri::WindowEvent::DragDrop(event) = event {
            println!("RUST DEBUG: Drag event detected! {:?}", event);
        }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        process_policy_file,
        open_file_dialog,
        run_ezlynx_filler
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
