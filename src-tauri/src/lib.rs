use std::process::Command;
use rfd::FileDialog;

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
    .invoke_handler(tauri::generate_handler![process_policy_file, open_file_dialog])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
