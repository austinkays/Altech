# Tauri + ChromaDB Bridge for Policy Q&A Assistant

This guide documents the backend configuration needed to connect the `PolicyQA` frontend (in `index.html`) to a local ChromaDB instance via Tauri.

---

## Architecture Overview

```
┌─────────────────────────────────────┐
│  index.html  (PolicyQA object)      │
│  ─────────────────────────────────  │
│  window.__TAURI__.core.invoke(cmd)  │
└──────────────┬──────────────────────┘
               │  IPC (JSON)
               ▼
┌─────────────────────────────────────┐
│  src-tauri/src/qna_commands.rs      │
│  ─────────────────────────────────  │
│  #[tauri::command]                  │
│  initialize_qna_db()                │
│  ingest_policy_document()           │
│  query_policy()                     │
└──────────────┬──────────────────────┘
               │  HTTP / Python subprocess
               ▼
┌─────────────────────────────────────┐
│  ChromaDB  (local, port 8000)       │
│  ─────────────────────────────────  │
│  Collections: policy_{id}           │
│  Embedding: all-MiniLM-L6-v2       │
└─────────────────────────────────────┘
```

---

## 1. Tauri Project Setup

If you haven't initialized Tauri yet:

```bash
# From the Altech project root
npm install --save-dev @tauri-apps/cli@latest
npx tauri init
```

In `src-tauri/tauri.conf.json`, point the dev server at your existing `index.html`:

```json
{
  "build": {
    "devUrl": "http://localhost:8000",
    "frontendDist": "../"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Altech Field Lead Pro",
        "width": 480,
        "height": 860,
        "resizable": true,
        "fullscreen": false
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "identifier": "com.altech.fieldlead"
  }
}
```

Key: `"withGlobalTauri": true` exposes `window.__TAURI__` which `PolicyQA.init()` checks for.

---

## 2. Rust Commands (`src-tauri/src/qna_commands.rs`)

These are the three IPC commands the frontend invokes:

```rust
use serde::{Deserialize, Serialize};
use tauri::command;
use base64::Engine;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct IngestResult {
    pub collection_id: String,
    pub page_count: usize,
    pub chunk_count: usize,
}

#[derive(Serialize, Deserialize)]
pub struct Citation {
    pub section: String,
    pub page: Option<usize>,
    pub snippet: String,
}

#[derive(Serialize, Deserialize)]
pub struct QueryResult {
    pub answer: String,
    pub citations: Vec<Citation>,
    pub confidence: String, // "high" | "medium" | "low"
}

/// Initialize the ChromaDB connection.
/// Called once when the Q&A tool opens.
#[command]
pub async fn initialize_qna_db() -> Result<String, String> {
    // Verify ChromaDB is reachable at localhost:8000
    let client = reqwest::Client::new();
    let res = client
        .get("http://localhost:8000/api/v1/heartbeat")
        .send()
        .await
        .map_err(|e| format!("ChromaDB not reachable: {}", e))?;

    if !res.status().is_success() {
        return Err("ChromaDB heartbeat failed".into());
    }

    Ok("ChromaDB connected".into())
}

/// Ingest a policy PDF/image: extract text, chunk it, embed, store in ChromaDB.
#[command]
pub async fn ingest_policy_document(
    file_name: String,
    file_base64: String,
    mime_type: String,
) -> Result<IngestResult, String> {
    // 1. Decode base64 to bytes
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&file_base64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    // 2. Save to temp file
    let tmp_dir = std::env::temp_dir().join("altech_qna");
    std::fs::create_dir_all(&tmp_dir).ok();
    let tmp_path = tmp_dir.join(&file_name);
    std::fs::write(&tmp_path, &bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // 3. Extract text (call Python sidecar or use pdf-extract crate)
    let text = extract_text(&tmp_path, &mime_type)?;

    // 4. Chunk the text (~500 chars with 50-char overlap)
    let chunks = chunk_text(&text, 500, 50);

    // 5. Create ChromaDB collection and add chunks
    let collection_id = format!("policy_{}", uuid::Uuid::new_v4());
    let client = reqwest::Client::new();

    // Create collection
    client
        .post("http://localhost:8000/api/v1/collections")
        .json(&serde_json::json!({
            "name": &collection_id,
            "metadata": { "source": file_name }
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to create collection: {}", e))?;

    // Add documents with embeddings
    // Note: ChromaDB can auto-embed if configured with a model
    let ids: Vec<String> = (0..chunks.len()).map(|i| format!("chunk_{}", i)).collect();

    client
        .post(format!(
            "http://localhost:8000/api/v1/collections/{}/add",
            collection_id
        ))
        .json(&serde_json::json!({
            "ids": ids,
            "documents": chunks,
            "metadatas": chunks.iter().enumerate().map(|(i, _)| {
                serde_json::json!({ "chunk_index": i, "source": &file_name })
            }).collect::<Vec<_>>()
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to add documents: {}", e))?;

    // Cleanup temp file
    std::fs::remove_file(&tmp_path).ok();

    Ok(IngestResult {
        collection_id,
        page_count: count_pages(&text),
        chunk_count: chunks.len(),
    })
}

/// Query the policy: semantic search in ChromaDB, then LLM answer.
#[command]
pub async fn query_policy(
    collection_id: String,
    question: String,
) -> Result<QueryResult, String> {
    let client = reqwest::Client::new();

    // 1. Semantic search in ChromaDB
    let search_res = client
        .post(format!(
            "http://localhost:8000/api/v1/collections/{}/query",
            collection_id
        ))
        .json(&serde_json::json!({
            "query_texts": [&question],
            "n_results": 5
        }))
        .send()
        .await
        .map_err(|e| format!("ChromaDB query failed: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse search results: {}", e))?;

    // 2. Extract relevant chunks
    let documents = search_res["documents"][0]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
        .unwrap_or_default();

    let context = documents.join("\n\n---\n\n");

    // 3. Send to LLM (Gemini / local Ollama / OpenAI — configure as needed)
    let answer = call_llm(&question, &context).await?;

    Ok(answer)
}

// --- Helper functions (implement based on your stack) ---

fn extract_text(path: &PathBuf, mime_type: &str) -> Result<String, String> {
    // Option A: Use `pdf-extract` crate for PDFs
    // Option B: Shell out to `pdftotext` (poppler-utils)
    // Option C: Call a Python sidecar with PyMuPDF
    todo!("Implement PDF/image text extraction")
}

fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        chunks.push(chars[start..end].iter().collect());
        start += chunk_size - overlap;
    }
    chunks
}

fn count_pages(text: &str) -> usize {
    // Rough estimate: ~3000 chars per page
    (text.len() / 3000).max(1)
}

async fn call_llm(question: &str, context: &str) -> Result<QueryResult, String> {
    // Configure your LLM endpoint here:
    //
    // Option A: Google Gemini (using GOOGLE_API_KEY from env)
    // Option B: Local Ollama (http://localhost:11434/api/generate)
    // Option C: OpenAI-compatible API
    //
    // System prompt should match the stateless version in PolicyQA.queryStateless()
    todo!("Implement LLM call with citation extraction")
}
```

### Register commands in `src-tauri/src/main.rs`:

```rust
mod qna_commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            qna_commands::initialize_qna_db,
            qna_commands::ingest_policy_document,
            qna_commands::query_policy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Cargo dependencies (`src-tauri/Cargo.toml`):

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

---

## 3. ChromaDB Local Setup

### Option A: Docker (recommended)

```bash
docker run -d \
  --name altech-chromadb \
  -p 8000:8000 \
  -v altech_chroma_data:/chroma/chroma \
  chromadb/chroma:latest
```

### Option B: Python pip

```bash
pip install chromadb
chroma run --host localhost --port 8000 --path ./chroma_data
```

### Verify it's running:

```bash
curl http://localhost:8000/api/v1/heartbeat
# Expected: {"nanosecond heartbeat": ...}
```

---

## 4. Python Sidecar Alternative (for PDF extraction)

If you prefer a Python sidecar instead of Rust-native PDF parsing:

### `src-tauri/sidecars/qna_processor.py`

```python
#!/usr/bin/env python3
"""
Tauri sidecar for PDF text extraction and optional embedding.
Called by the Rust backend via Command::new_sidecar().
"""

import sys
import json
import fitz  # PyMuPDF

def extract_pdf(file_path: str) -> dict:
    doc = fitz.open(file_path)
    pages = []
    full_text = ""
    for i, page in enumerate(doc):
        text = page.get_text()
        pages.append({"page": i + 1, "text": text})
        full_text += f"\n--- Page {i + 1} ---\n{text}"
    return {
        "text": full_text.strip(),
        "pageCount": len(pages),
        "pages": pages
    }

if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "help"

    if command == "extract":
        file_path = sys.argv[2]
        result = extract_pdf(file_path)
        print(json.dumps(result))
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
```

### Configure sidecar in `tauri.conf.json`:

```json
{
  "bundle": {
    "externalBin": ["sidecars/qna_processor"]
  }
}
```

### Call from Rust:

```rust
use tauri::api::process::Command;

let output = Command::new_sidecar("qna_processor")
    .expect("failed to setup sidecar")
    .args(["extract", tmp_path.to_str().unwrap()])
    .output()
    .expect("failed to run sidecar");

let result: serde_json::Value = serde_json::from_str(&output.stdout)?;
```

---

## 5. Frontend ↔ Backend Contract

The `PolicyQA` object in `index.html` calls exactly three Tauri commands:

| JS Call | Rust Command | Purpose |
|---|---|---|
| `invoke('initialize_qna_db')` | `initialize_qna_db()` | Verify ChromaDB is alive |
| `invoke('ingest_policy_document', { fileName, fileBase64, mimeType })` | `ingest_policy_document(...)` | Parse PDF → chunk → embed → store |
| `invoke('query_policy', { collectionId, question })` | `query_policy(...)` | Semantic search → LLM → answer with citations |

### Response shapes:

```typescript
// initialize_qna_db
type InitResult = string; // "ChromaDB connected"

// ingest_policy_document
interface IngestResult {
  collectionId: string;   // "policy_abc123..."
  pageCount: number;
  chunkCount: number;
}

// query_policy
interface QueryResult {
  answer: string;         // Full text with [Section X.X] citations inline
  citations: Citation[];  // [{ section, page, snippet }]
  confidence: "high" | "medium" | "low";
}
```

---

## 6. Fallback Behavior (Browser-Only)

When `window.__TAURI__` is not detected, `PolicyQA` automatically:

1. Shows the "Desktop Feature — Stateless Mode Active" banner
2. Extracts PDF text client-side via `pdf.js` (if loaded) or `FileReader`
3. Sends the full extracted text + question to `/api/vision-processor.js` (Gemini)
4. Falls back to basic keyword search if API is unavailable
5. Stores only recent policy metadata in `localStorage` (`altech_v6_qna`)

No ChromaDB, no embeddings, no persistent vector store — just per-session text extraction.

---

## 7. Future Enhancements

- [ ] **pdf.js CDN**: Add `<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js">` for reliable browser PDF extraction
- [ ] **Ollama integration**: Local LLM for fully offline Q&A (llama3, mistral)
- [ ] **Multi-policy comparison**: "Compare deductibles across my 3 uploaded policies"
- [ ] **Citation click-to-highlight**: Jump to the exact section in a PDF viewer
- [ ] **Conversation persistence**: Save Q&A threads per policy in `altech_v6_qna`
