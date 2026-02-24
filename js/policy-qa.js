// PolicyQA - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const QNA_STORAGE_KEY = 'altech_v6_qna';

            const PolicyQA = {
                isTauri: false,
                initialized: false,
                files: [],          // { id, name, size, status, pages, extractedText }
                messages: [],       // { role: 'user'|'ai'|'system', text, citations?, confidence? }
                recentPolicies: [], // { id, name, analyzedAt, pageCount, carrier }
                activeCollectionId: null,
                isProcessing: false,

                // ─── Lifecycle ───────────────────────────

                init() {
                    if (this.initialized) return;
                    this.initialized = true;

                    this.isTauri = !!(window.__TAURI__ || window.__TAURI_IPC__);
                    console.log(`[PolicyQA] init — Tauri: ${this.isTauri}`);

                    this.loadState();
                    this.loadStateFromDisk(); // async merge from server
                    this.renderRecentList();
                    this.setupDropZone();

                    if (this.isTauri) {
                        this.initTauriBackend();
                    } else {
                        document.getElementById('qnaEnvBanner').style.display = 'block';
                    }

                    // Enable input if there are already loaded files
                    if (this.files.some(f => f.status === 'indexed')) {
                        this.enableChat();
                    }
                },

                // ─── Tauri Bridge ────────────────────────

                async initTauriBackend() {
                    try {
                        const { invoke } = window.__TAURI__.core || window.__TAURI__;
                        const result = await invoke('initialize_qna_db');
                        console.log('[PolicyQA] ChromaDB ready:', result);
                        this.addSystemMessage('✅ Connected to local vector database.');
                    } catch (err) {
                        console.error('[PolicyQA] Tauri backend init failed:', err);
                        this.isTauri = false;
                        document.getElementById('qnaEnvBanner').style.display = 'block';

                        // Auto-detect Gemini API key from multiple sources
                        await this.resolveGeminiKey();
                    }
                },

                async resolveGeminiKey() {
                    // 1. Check localStorage (previously saved by user)
                    const savedKey = localStorage.getItem('gemini_api_key');
                    if (savedKey) {
                        this._geminiApiKey = savedKey;
                        this.addSystemMessage('✅ Ready — drop a PDF to get started.');
                        return;
                    }

                    // 2. Try config endpoint (Vercel serves both keys)
                    try {
                        const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/config?type=keys') : fetch('/api/config?type=keys'));
                        if (res.ok) {
                            const data = await res.json();
                            if (data.geminiKey) {
                                this._geminiApiKey = data.geminiKey;
                                console.log('[PolicyQA] Gemini key loaded from /api/config?type=keys');
                                this.addSystemMessage('✅ Ready — drop a PDF to get started.');
                                return;
                            }
                        }
                    } catch (e) {
                        console.warn('[PolicyQA] Could not load /api/config?type=keys:', e);
                    }

                    // 3. Fallback: try api/config.json (local dev only)
                    try {
                        const res = await fetch('api/config.json');
                        if (res.ok) {
                            const data = await res.json();
                            if (data.apiKey) {
                                this._geminiApiKey = data.apiKey;
                                console.log('[PolicyQA] Gemini key loaded from api/config.json');
                                this.addSystemMessage('✅ Ready — drop a PDF to get started.');
                                return;
                            }
                        }
                    } catch (e) { /* not available locally */ }

                    // 4. No key found — prompt user
                    this.addSystemMessage('⚠️ No API key configured. For smart answers, <a href="#" onclick="PolicyQA.promptGeminiKey(); return false;" style="color:var(--primary-color,#007AFF);text-decoration:underline;">set your API key</a>.');
                },

                promptGeminiKey() {
                    const key = prompt('Enter your Google Gemini API key (get one at https://aistudio.google.com/apikey):');
                    if (key && key.trim()) {
                        this._geminiApiKey = key.trim();
                        localStorage.setItem('gemini_api_key', key.trim());
                        this.addSystemMessage('✅ API key saved. Smart Q&A is now active!');
                        App.toast('✅ Gemini API key configured');
                    }
                },

                async tauriInvoke(cmd, args = {}) {
                    if (!this.isTauri) throw new Error('Tauri not available');
                    const { invoke } = window.__TAURI__.core || window.__TAURI__;
                    return invoke(cmd, args);
                },

                // ─── State (plain JSON, no encryption) ──

                loadState() {
                    try {
                        const raw = localStorage.getItem(QNA_STORAGE_KEY);
                        if (raw) {
                            const state = JSON.parse(raw);
                            this.recentPolicies = state.recentPolicies || [];
                        }
                    } catch (e) {
                        console.warn('[PolicyQA] loadState failed:', e);
                    }
                },

                saveState() {
                    const stateData = {
                        recentPolicies: this.recentPolicies.slice(0, 20), // Cap at 20
                        lastUpdated: new Date().toISOString()
                    };
                    localStorage.setItem(QNA_STORAGE_KEY, JSON.stringify(stateData));
                    // Sync to disk (debounced, fire-and-forget)
                    // Strip extractedText to keep disk file small (it can be huge)
                    clearTimeout(this._diskSyncTimer);
                    this._diskSyncTimer = setTimeout(() => {
                        const diskData = {
                            recentPolicies: this.recentPolicies.slice(0, 20).map(r => ({
                                ...r,
                                extractedText: r.extractedText ? r.extractedText.slice(0, 50000) : null // Cap at 50K chars per policy
                            })),
                            lastUpdated: new Date().toISOString()
                        };
                        fetch('/local/scan-history', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(diskData)
                        }).catch(() => {});
                    }, 1000);
                },

                async loadStateFromDisk() {
                    try {
                        const res = await fetch('/local/scan-history');
                        if (!res.ok) return;
                        const data = await res.json();
                        const diskPolicies = data.recentPolicies || [];
                        if (diskPolicies.length === 0) return;
                        // Merge: localStorage wins for same-name entries, disk fills gaps
                        const localNames = new Set(this.recentPolicies.map(r => r.name));
                        let added = 0;
                        for (const dp of diskPolicies) {
                            if (!localNames.has(dp.name)) {
                                this.recentPolicies.push(dp);
                                localNames.add(dp.name);
                                added++;
                            }
                        }
                        if (added > 0) {
                            this.recentPolicies = this.recentPolicies.slice(0, 20);
                            localStorage.setItem(QNA_STORAGE_KEY, JSON.stringify({
                                recentPolicies: this.recentPolicies,
                                lastUpdated: new Date().toISOString()
                            }));
                            this.renderRecentList();
                            console.log(`[PolicyQA] Merged ${added} policies from disk`);
                        }
                    } catch (e) { /* disk not available */ }
                },

                // ─── Drag & Drop / File Handling ────────

                setupDropZone() {
                    const zone = document.getElementById('qnaDropZone');
                    if (!zone) return;

                    // Fix red circle cursor: preventDefault + dropEffect = 'copy' shows green plus
                    zone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        zone.classList.add('drag-over');
                    });
                    zone.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                        zone.classList.add('drag-over');
                    });
                    zone.addEventListener('dragleave', () => {
                        zone.classList.remove('drag-over');
                    });
                    zone.addEventListener('drop', e => {
                        e.preventDefault();
                        zone.classList.remove('drag-over');
                        if (e.dataTransfer?.files?.length) this.handleFiles(e.dataTransfer.files);
                    });

                    // Click handler: native file dialog in Tauri, fallback file input otherwise
                    zone.addEventListener('click', async () => {
                        if (this.isTauri && window.__TAURI__?.core?.invoke) {
                            try {
                                const filePath = await window.__TAURI__.core.invoke('open_file_dialog');
                                if (filePath) {
                                    const fileName = filePath.split('\\').pop().split('/').pop();
                                    console.log('[PolicyQA] Native dialog — selected:', fileName);

                                    const id = this.generateId();
                                    const entry = { id, name: fileName, size: 0, status: 'processing', pages: null, extractedText: null };
                                    this.files.push(entry);
                                    this.renderFileList();
                                    this.setProgress(20);

                                    const text = await window.__TAURI__.core.invoke('process_policy_file', { filePath });
                                    this.setProgress(80);
                                    console.log('[PolicyQA] Extracted text length:', text?.length);

                                    if (text && !text.startsWith('Error:') && !text.startsWith('Execution failed:')) {
                                        entry.extractedText = text;
                                        entry.status = 'indexed';
                                        this.enableChat();
                                        this.addSystemMessage(`📄 "${fileName}" processed successfully (${text.length} chars extracted). Ask your questions below.`);
                                        this.addToRecent(entry);
                                        App.toast(`✅ ${fileName} ready for Q&A`);
                                    } else {
                                        entry.status = 'error';
                                        this.addSystemMessage(`❌ Failed to process "${fileName}": ${text || 'No text extracted'}`);
                                        App.toast(`❌ ${fileName} — processing failed`);
                                    }
                                    this.setProgress(100);
                                    this.renderFileList();
                                }
                            } catch (err) {
                                console.error('[PolicyQA] File dialog error:', err);
                                App.toast(`❌ File dialog error: ${err.message || err}`);
                            }
                        } else {
                            // Browser fallback: create hidden file input and trigger it
                            const fileInput = document.createElement('input');
                            fileInput.type = 'file';
                            fileInput.accept = '.pdf,.png,.jpg,.jpeg,.heic,.tiff,.webp';
                            fileInput.multiple = true;
                            fileInput.style.display = 'none';
                            fileInput.addEventListener('change', () => {
                                if (fileInput.files?.length) this.handleFiles(fileInput.files);
                                fileInput.remove();
                            });
                            document.body.appendChild(fileInput);
                            fileInput.click();
                        }
                    });

                    // Tauri v2: listen for native file drops to get actual file paths
                    if (this.isTauri && window.__TAURI__?.event?.listen) {
                        window.__TAURI__.event.listen('tauri://drag-drop', async (event) => {
                            const paths = event.payload?.paths;
                            if (!paths || !paths.length) return;
                            zone.classList.remove('drag-over');

                            for (const filePath of paths) {
                                const fileName = filePath.split('\\').pop().split('/').pop();
                                console.log('[PolicyQA] Tauri drop — processing:', fileName);

                                // Create a file entry for the UI
                                const id = this.generateId();
                                const entry = {
                                    id,
                                    name: fileName,
                                    size: 0,
                                    status: 'processing',
                                    pages: null,
                                    extractedText: null
                                };
                                this.files.push(entry);
                                this.renderFileList();
                                this.setProgress(20);

                                try {
                                    // Call Rust backend to extract text via Python
                                    const text = await window.__TAURI__.core.invoke('process_policy_file', { filePath });
                                    this.setProgress(80);
                                    console.log('[PolicyQA] Extracted text length:', text?.length);

                                    if (text && !text.startsWith('Error:') && !text.startsWith('Execution failed:')) {
                                        entry.extractedText = text;
                                        entry.status = 'indexed';
                                        this.enableChat();
                                        this.addSystemMessage(`📄 "${fileName}" processed successfully (${text.length} chars extracted). Ask your questions below.`);
                                        this.addToRecent(entry);
                                        App.toast(`✅ ${fileName} ready for Q&A`);
                                    } else {
                                        entry.status = 'error';
                                        const errorMsg = text || 'No text extracted';
                                        this.addSystemMessage(`❌ Failed to process "${fileName}": ${errorMsg}`);
                                        App.toast(`❌ ${fileName} — processing failed`);
                                        console.error('[PolicyQA] Backend error:', errorMsg);
                                    }
                                } catch (err) {
                                    entry.status = 'error';
                                    this.addSystemMessage(`❌ Failed to process "${fileName}": ${err.message || err}`);
                                    App.toast(`❌ ${fileName} — processing failed`);
                                    console.error('[PolicyQA] Invoke error:', err);
                                }

                                this.setProgress(100);
                                this.renderFileList();
                            }
                        });
                        window.__TAURI__.event.listen('tauri://drag-enter', () => {
                            zone.classList.add('drag-over');
                        });
                        window.__TAURI__.event.listen('tauri://drag-leave', () => {
                            zone.classList.remove('drag-over');
                        });
                    }
                },

                async handleFiles(fileList) {
                    const maxSize = 25 * 1024 * 1024; // 25 MB
                    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/tiff', 'image/webp'];

                    for (const file of Array.from(fileList)) {
                        if (file.size > maxSize) {
                            App.toast(`❌ ${file.name} exceeds 25 MB limit`);
                            continue;
                        }
                        if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|png|jpe?g|heic|tiff|webp)$/i)) {
                            App.toast(`❌ ${file.name} — unsupported file type`);
                            continue;
                        }

                        const id = this.generateId();
                        const entry = {
                            id,
                            name: file.name,
                            size: file.size,
                            status: 'processing',
                            pages: null,
                            extractedText: null,
                            _file: file   // transient — not persisted
                        };
                        this.files.push(entry);
                        this.renderFileList();

                        // Process file
                        try {
                            await this.processFile(entry);
                        } catch (err) {
                            entry.status = 'error';
                            console.error(`[PolicyQA] Failed to process ${file.name}:`, err);
                            App.toast(`❌ Failed to process ${file.name}`);
                            this.renderFileList();
                        }
                    }
                },

                async processFile(entry) {
                    this.setProgress(20);

                    if (this.isTauri) {
                        // ── Tauri path: send to Rust sidecar for PDF parsing + ChromaDB indexing
                        const fileBytes = await this.fileToBase64(entry._file);
                        this.setProgress(40);

                        const result = await this.tauriInvoke('ingest_policy_document', {
                            fileName: entry.name,
                            fileBase64: fileBytes,
                            mimeType: entry._file.type
                        });

                        entry.status = 'indexed';
                        entry.pages = result.pageCount || null;
                        entry.extractedText = null; // stored in ChromaDB, not in memory
                        this.activeCollectionId = result.collectionId;
                        this.setProgress(100);
                    } else {
                        // ── Stateless browser path: extract text client-side
                        if (entry._file.type === 'application/pdf') {
                            entry.extractedText = await this.extractPdfText(entry._file);
                        } else {
                            // For images, we need server-side OCR or Gemini vision
                            entry.extractedText = await this.extractImageText(entry._file);
                        }
                        entry.status = entry.extractedText ? 'indexed' : 'error';
                        this.setProgress(100);
                    }

                    if (entry.status === 'indexed') {
                        this.enableChat();
                        this.addSystemMessage(`📄 "${entry.name}" processed successfully. Ask your questions below.`);
                        this.addToRecent(entry);
                        App.toast(`✅ ${entry.name} ready for Q&A`);
                    }

                    this.renderFileList();
                    // Clear transient file handle
                    delete entry._file;
                },

                async extractPdfText(file) {
                    // Use pdf.js if available, otherwise fall back to FileReader text extraction
                    if (window.pdfjsLib) {
                        try {
                            const arrayBuf = await file.arrayBuffer();
                            const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
                            let text = '';
                            for (let i = 1; i <= pdf.numPages; i++) {
                                const page = await pdf.getPage(i);
                                const content = await page.getTextContent();
                                text += content.items.map(item => item.str).join(' ') + '\n\n';
                            }
                            return text.trim() || null;
                        } catch (e) {
                            console.warn('[PolicyQA] pdf.js extraction failed:', e);
                        }
                    }
                    // Fallback: pdf.js not loaded — attempt dynamic load, otherwise fail gracefully
                    console.warn('[PolicyQA] pdf.js not available — attempting dynamic load');
                    try {
                        await this.loadPdfJs();
                        if (window.pdfjsLib) {
                            const arrayBuf = await file.arrayBuffer();
                            const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
                            let text = '';
                            for (let i = 1; i <= pdf.numPages; i++) {
                                const page = await pdf.getPage(i);
                                const content = await page.getTextContent();
                                text += content.items.map(item => item.str).join(' ') + '\n\n';
                            }
                            return text.trim() || null;
                        }
                    } catch (e2) {
                        console.warn('[PolicyQA] Dynamic pdf.js load failed:', e2);
                    }
                    // Cannot extract text from PDF without pdf.js — return null instead of raw binary
                    this.addSystemMessage('⚠️ PDF text extraction library failed to load. Try refreshing the page or check your internet connection.');
                    return null;
                },

                async loadPdfJs() {
                    if (window.pdfjsLib) return;
                    return new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                        script.onload = () => {
                            if (window.pdfjsLib) {
                                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                            }
                            resolve();
                        };
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                },

                async extractImageText(file) {
                    // Attempt server-side vision extraction via existing policy-scan endpoint
                    try {
                        const base64 = await this.fileToBase64(file);
                        const res = await fetch('/api/vision-processor.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                image: base64,
                                mimeType: file.type,
                                prompt: 'Extract all text from this insurance policy document. Return the raw text only.',
                                aiSettings: window.AIProvider?.getSettings()
                            })
                        });
                        if (res.ok) {
                            const data = await res.json();
                            return data.text || data.extractedText || null;
                        }
                    } catch (e) {
                        console.warn('[PolicyQA] Image text extraction failed:', e);
                    }
                    return null;
                },

                // ─── Chat Engine ─────────────────────────

                enableChat() {
                    const input = document.getElementById('qnaInput');
                    const btn = document.getElementById('qnaSendBtn');
                    if (input) { input.disabled = false; input.placeholder = 'Ask about your policy…'; }
                    if (btn) btn.disabled = false;
                },

                disableChat() {
                    const input = document.getElementById('qnaInput');
                    const btn = document.getElementById('qnaSendBtn');
                    if (input) { input.disabled = true; input.placeholder = 'Upload a policy document first…'; }
                    if (btn) btn.disabled = true;
                },

                askQuick(question) {
                    const input = document.getElementById('qnaInput');
                    if (input) input.value = question;
                    this.send();
                },

                async send() {
                    const input = document.getElementById('qnaInput');
                    const question = input?.value?.trim();
                    if (!question || this.isProcessing) return;

                    // Validate we have something to query
                    const hasContent = this.isTauri
                        ? !!this.activeCollectionId
                        : this.files.some(f => f.extractedText);

                    if (!hasContent) {
                        App.toast('⚠️ Upload a policy document first');
                        return;
                    }

                    input.value = '';
                    this.addMessage('user', question);
                    this.showTyping();
                    this.isProcessing = true;

                    try {
                        let answer;
                        if (this.isTauri) {
                            answer = await this.queryTauri(question);
                        } else {
                            answer = await this.queryStateless(question);
                        }
                        this.hideTyping();
                        this.addAIMessage(answer);
                    } catch (err) {
                        this.hideTyping();
                        console.error('[PolicyQA] Query failed:', err);
                        this.addMessage('ai', '❌ Sorry, something went wrong. Please try again.');
                    } finally {
                        this.isProcessing = false;
                    }
                },

                async queryTauri(question) {
                    const result = await this.tauriInvoke('query_policy', {
                        collectionId: this.activeCollectionId,
                        question: question
                    });
                    return {
                        text: result.answer,
                        citations: result.citations || [],   // [{ section, page, snippet }]
                        confidence: result.confidence || null // 'high' | 'medium' | 'low'
                    };
                },

                async queryStateless(question) {
                    // Gather all extracted text
                    const policyText = this.files
                        .filter(f => f.extractedText)
                        .map(f => `=== ${f.name} ===\n${f.extractedText}`)
                        .join('\n\n');

                    // Truncate to ~100k chars to stay within API limits
                    const truncated = policyText.slice(0, 100000);

                    const systemPrompt = `You are a helpful insurance policy analyst assisting an insurance agent. The user has uploaded policy documents. Answer their question based ONLY on the provided policy text.

RULES:
1. ALWAYS cite specific sections, pages, or paragraphs using inline brackets: [Section 4.2], [Page 3], [Declarations Page].
2. If the answer requires interpretation or inference, state your confidence level explicitly: HIGH (directly stated in text), MEDIUM (implied or reasonably inferred), LOW (not clearly addressed).
3. For coverage and exclusion questions, ALWAYS include a confidence level.
4. NEVER hallucinate or invent coverage details. If the policy text doesn't address the question, say: "This does not appear to be addressed in the provided policy text."
5. Use professional but friendly language suitable for an insurance agent reviewing data.
6. When quoting specific limits, deductibles, or dollar amounts, format them clearly (e.g., "$100,000/$300,000 BI limits").
7. If multiple documents contain conflicting information, note the conflict and indicate which document is likely more authoritative (dec page > endorsement > general provisions).

EXAMPLE RESPONSES:

User: "Is water backup covered?"
Good: "Yes, water backup coverage is included as an endorsement [Page 4, Endorsement HO-34]. The limit is $10,000 with a $500 deductible [Declarations Page]. Confidence: HIGH — this is explicitly listed."

User: "What's the wind deductible?"
Good: "The wind/hail deductible is 2% of the dwelling coverage amount ($350,000), which equals $7,000 [Declarations Page, line 'Wind/Hail Ded']. Note this is separate from the all-perils deductible of $1,000. Confidence: HIGH."

User: "Am I covered if my dog bites someone?"
Good: "Based on the policy text, personal liability coverage is $300,000 [Declarations Page]. However, I don't see a specific dog breed exclusion in the provided documents. Many carriers exclude certain breeds — you should verify with the carrier directly. Confidence: MEDIUM — liability coverage exists but breed-specific exclusions may not be in the dec page."

POLICY TEXT:\n${truncated}`;

                    // Try 1: AIProvider (supports Google, OpenRouter, OpenAI, Anthropic)
                    if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                        try {
                            const result = await AIProvider.ask(
                                systemPrompt,
                                'USER QUESTION: ' + question,
                                { temperature: 0.2, maxTokens: 2048 }
                            );
                            if (result.text) {
                                console.log('[PolicyQA] AIProvider response received (' + AIProvider.getProvider() + '/' + AIProvider.getModel() + ')');
                                return this.parseAIResponse(result.text);
                            }
                        } catch (e) {
                            console.warn('[PolicyQA] AIProvider call failed:', e);
                        }
                    }

                    // Try 1b: Legacy direct Gemini fallback (when AIProvider not configured)
                    const geminiKey = this._geminiApiKey || localStorage.getItem('gemini_api_key');
                    if (geminiKey && (typeof AIProvider === 'undefined' || !AIProvider.isConfigured())) {
                        try {
                            const geminiRes = await fetch(
                                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [{ parts: [{ text: systemPrompt + '\n\nUSER QUESTION: ' + question }] }],
                                        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
                                    })
                                }
                            );
                            if (geminiRes.ok) {
                                const geminiData = await geminiRes.json();
                                const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                if (raw) {
                                    console.log('[PolicyQA] Gemini direct API response received');
                                    return this.parseAIResponse(raw);
                                }
                            } else {
                                console.warn('[PolicyQA] Gemini API returned', geminiRes.status);
                            }
                        } catch (e) {
                            console.warn('[PolicyQA] Gemini direct API failed:', e);
                        }
                    }

                    // Try 2: Vercel serverless function (works when deployed to web)
                    try {
                        const res = await fetch('/api/vision-processor.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                prompt: question,
                                systemPrompt: systemPrompt,
                                mode: 'text-analysis',
                                aiSettings: window.AIProvider?.getSettings()
                            })
                        });

                        if (res.ok) {
                            const data = await res.json();
                            const raw = data.text || data.answer || '';
                            return this.parseAIResponse(raw);
                        }
                    } catch (e) {
                        console.warn('[PolicyQA] Vercel API call failed:', e);
                    }

                    // Try 3: Offline fallback — keyword search + document summary
                    return this.offlineSearch(question, policyText);
                },

                parseAIResponse(raw) {
                    // Extract inline citations like [Section X.X] or [Page N]
                    const citationPattern = /\[(Section\s+[\d.]+[^\]]*|Page\s+\d+[^\]]*|§\s*[\d.]+[^\]]*|Part\s+[A-Z0-9]+[^\]]*)\]/gi;
                    const citations = [];
                    let match;
                    while ((match = citationPattern.exec(raw)) !== null) {
                        const cite = match[1].trim();
                        if (!citations.find(c => c.section === cite)) {
                            citations.push({ section: cite, page: null, snippet: '' });
                        }
                    }

                    // Detect confidence indicators
                    let confidence = null;
                    if (/\b(high confidence|clearly stated|explicitly stated|directly addressed)\b/i.test(raw)) {
                        confidence = 'high';
                    } else if (/\b(medium confidence|appears to|seems to|likely|implied)\b/i.test(raw)) {
                        confidence = 'medium';
                    } else if (/\b(low confidence|unclear|not clearly|cannot determine|not addressed)\b/i.test(raw)) {
                        confidence = 'low';
                    }

                    return { text: raw, citations, confidence };
                },

                offlineSearch(question, policyText) {
                    const lowerQ = question.toLowerCase();

                    // Detect "summary" or "what do you see" type questions
                    const isSummaryQ = /what (do you |can you )?see|summar|overview|what('s| is) (this|the doc)|tell me about|describe/i.test(lowerQ);

                    if (isSummaryQ && policyText.length > 0) {
                        // Return the first ~2000 chars as a document summary
                        const preview = policyText.slice(0, 2000).trim();
                        return {
                            text: `Here is a summary of the uploaded document content (showing raw extracted text):\n\n---\n${preview}\n---\n\n📄 Total extracted: ${policyText.length} characters. For smart analysis, configure your API key (Settings → API Keys) or ensure network connectivity.`,
                            citations: [],
                            confidence: 'medium'
                        };
                    }

                    // Keyword matching — include shorter words too
                    const stopWords = new Set(['the','and','for','that','this','with','from','your','what','does','have','how','are','was','were','been','being','which','where','when','who','whom','will','would','could','should','about','into','each','than','them','then','these','those','other','some','such']);
                    const keywords = lowerQ.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
                    const lines = policyText.split('\n').filter(l => l.trim().length > 10);
                    const matches = [];

                    for (const line of lines) {
                        const lower = line.toLowerCase();
                        const score = keywords.filter(kw => lower.includes(kw)).length;
                        if (score > 0) matches.push({ line: line.trim(), score });
                    }

                    matches.sort((a, b) => b.score - a.score);
                    const top = matches.slice(0, 5);

                    if (top.length === 0) {
                        // Last resort: show beginning of document
                        if (policyText.length > 0) {
                            const preview = policyText.slice(0, 1500).trim();
                            return {
                                text: `I couldn't find a direct keyword match for your question. Here's the beginning of the document for context:\n\n---\n${preview}\n---\n\n💡 Tip: Try using specific terms from the policy (e.g., "deductible", "coverage limit", "exclusion"). For smart answers, configure your API key.`,
                                citations: [],
                                confidence: 'low'
                            };
                        }
                        return {
                            text: 'I could not find relevant information in the uploaded policy text for that question. Try rephrasing or uploading additional pages.',
                            citations: [],
                            confidence: 'low'
                        };
                    }

                    const snippets = top.map((m, i) => `${i + 1}. "${m.line.slice(0, 300)}"`).join('\n\n');
                    return {
                        text: `Here are the most relevant passages I found (keyword match — offline mode):\n\n${snippets}\n\n⚠️ This is a basic search. For smart answers, configure your API key or ensure network connectivity.`,
                        citations: [],
                        confidence: 'low'
                    };
                },

                // ─── Message Rendering ───────────────────

                addMessage(role, text) {
                    this.messages.push({ role, text, timestamp: Date.now() });
                    this.renderMessage(role, text);
                },

                addAIMessage(answer) {
                    this.messages.push({
                        role: 'ai',
                        text: answer.text,
                        citations: answer.citations,
                        confidence: answer.confidence,
                        timestamp: Date.now()
                    });
                    this.renderAIMessage(answer);
                },

                addSystemMessage(text) {
                    const container = document.getElementById('qnaMessages');
                    if (!container) return;
                    const div = document.createElement('div');
                    div.className = 'qna-msg system';
                    div.innerHTML = text;
                    container.appendChild(div);
                    container.scrollTop = container.scrollHeight;
                },

                renderMessage(role, text) {
                    const container = document.getElementById('qnaMessages');
                    if (!container) return;
                    const div = document.createElement('div');
                    div.className = `qna-msg ${role}`;
                    div.textContent = text;
                    container.appendChild(div);
                    container.scrollTop = container.scrollHeight;
                },

                renderAIMessage(answer) {
                    const container = document.getElementById('qnaMessages');
                    if (!container) return;
                    const div = document.createElement('div');
                    div.className = 'qna-msg ai';

                    // Render text with citation badges
                    let html = this.escapeHtml(answer.text);
                    // Replace [Section X.X] patterns with styled citations
                    html = html.replace(/\[(Section\s+[\d.]+[^\]]*|Page\s+\d+[^\]]*|§\s*[\d.]+[^\]]*|Part\s+[A-Z0-9]+[^\]]*)\]/gi,
                        '<span class="citation" title="Policy reference">$1</span>');

                    // Preserve newlines
                    html = html.replace(/\n/g, '<br>');

                    // Add confidence indicator
                    if (answer.confidence) {
                        const labels = { high: '🟢 High Confidence', medium: '🟡 Medium Confidence', low: '🔴 Low Confidence' };
                        html += `<div class="confidence-indicator ${answer.confidence}">${labels[answer.confidence]}</div>`;
                    }

                    div.innerHTML = html;
                    container.appendChild(div);
                    container.scrollTop = container.scrollHeight;
                },

                showTyping() {
                    const container = document.getElementById('qnaMessages');
                    if (!container) return;
                    const div = document.createElement('div');
                    div.className = 'qna-msg ai';
                    div.id = 'qnaTypingIndicator';
                    div.innerHTML = '<div class="qna-typing"><span></span><span></span><span></span></div>';
                    container.appendChild(div);
                    container.scrollTop = container.scrollHeight;
                },

                hideTyping() {
                    document.getElementById('qnaTypingIndicator')?.remove();
                },

                // ─── File List UI ────────────────────────

                renderFileList() {
                    const list = document.getElementById('qnaFileList');
                    if (!list) return;

                    if (this.files.length === 0) {
                        list.innerHTML = '';
                        return;
                    }

                    list.innerHTML = this.files.map(f => {
                        const sizeStr = f.size > 1024 * 1024
                            ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.round(f.size / 1024)} KB`;
                        const statusClass = f.status;
                        const statusLabel = f.status === 'indexed' ? '✓ Ready'
                            : f.status === 'processing' ? '⏳ Processing…'
                            : '✗ Error';
                        return `<div class="qna-file-item">
                            <div class="file-info">
                                <span class="file-name">📄 ${this.escapeHtml(f.name)}</span>
                                <span class="file-size">${sizeStr}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span class="file-status ${statusClass}">${statusLabel}</span>
                                <button class="qna-file-remove" onclick="PolicyQA.removeFile('${f.id}')" title="Remove">✕</button>
                            </div>
                        </div>`;
                    }).join('');
                },

                removeFile(id) {
                    this.files = this.files.filter(f => f.id !== id);
                    this.renderFileList();
                    if (!this.files.some(f => f.status === 'indexed')) {
                        this.disableChat();
                    }
                    App.toast('🗑️ File removed');
                },

                // ─── Recent Policies ─────────────────────

                addToRecent(entry) {
                    // Deduplicate by name
                    this.recentPolicies = this.recentPolicies.filter(r => r.name !== entry.name);
                    this.recentPolicies.unshift({
                        id: entry.id,
                        name: entry.name,
                        analyzedAt: new Date().toISOString(),
                        pageCount: entry.pages || null,
                        carrier: this.detectCarrier(entry.extractedText || ''),
                        extractedText: entry.extractedText || null
                    });
                    this.saveState();
                    this.renderRecentList();
                },

                detectCarrier(text) {
                    // Simple carrier name detection from policy text
                    const carriers = [
                        'Progressive', 'GEICO', 'State Farm', 'Allstate', 'Liberty Mutual',
                        'Nationwide', 'Travelers', 'USAA', 'Farmers', 'American Family',
                        'Hartford', 'Erie', 'Safeco', 'Mercury', 'Kemper', 'Bristol West',
                        'National General', 'Dairyland', 'Foremost', 'Stillwater', 'PEMCO',
                        'Mutual of Enumclaw', 'Oregon Mutual', 'Grange', 'Auto-Owners'
                    ];
                    for (const c of carriers) {
                        if (text.toLowerCase().includes(c.toLowerCase())) return c;
                    }
                    return null;
                },

                renderRecentList() {
                    const card = document.getElementById('qnaRecentCard');
                    const list = document.getElementById('qnaRecentList');
                    if (!card || !list) return;

                    if (this.recentPolicies.length === 0) {
                        card.style.display = 'none';
                        return;
                    }

                    card.style.display = 'block';
                    const activeNames = new Set(this.files.filter(f => f.status === 'indexed').map(f => f.name));

                    list.innerHTML = this.recentPolicies.slice(0, 10).map((r, idx) => {
                        const date = new Date(r.analyzedAt).toLocaleDateString();
                        const meta = [r.carrier, r.pageCount ? `${r.pageCount} pages` : null, date].filter(Boolean).join(' · ');
                        const isActive = activeNames.has(r.name);
                        const hasText = !!r.extractedText;
                        return `<div class="qna-recent-item" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;cursor:${hasText ? 'pointer' : 'default'};background:${isActive ? 'var(--primary-color-light, #e8f0fe)' : 'transparent'};border:1px solid ${isActive ? 'var(--primary-color, #007AFF)' : '#e0e0e0'};margin-bottom:6px;transition:background 0.15s">
                            <div style="flex:1;min-width:0" onclick="PolicyQA.loadRecent(${idx})">
                                <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📄 ${this.escapeHtml(r.name)}${isActive ? ' <span style="color:var(--primary-color,#007AFF);font-size:0.8em">(active)</span>' : ''}</div>
                                <div style="font-size:0.82em;color:#888;margin-top:2px">${meta}${hasText ? '' : ' · <em>re-upload needed</em>'}</div>
                            </div>
                            <button onclick="event.stopPropagation();PolicyQA.deleteRecent(${idx})" title="Delete" style="background:none;border:none;cursor:pointer;font-size:1.1em;padding:4px 6px;border-radius:4px;color:#999;transition:color 0.15s" onmouseover="this.style.color='#e53e3e'" onmouseout="this.style.color='#999'">✕</button>
                        </div>`;
                    }).join('');
                },

                loadRecent(idx) {
                    const r = this.recentPolicies[idx];
                    if (!r) return;

                    if (!r.extractedText) {
                        App.toast('⚠️ Re-upload this file — text was not stored for older entries');
                        return;
                    }

                    // Check if already loaded
                    if (this.files.some(f => f.name === r.name && f.status === 'indexed')) {
                        App.toast('📄 ' + r.name + ' is already active');
                        return;
                    }

                    // Load into files array as an indexed entry
                    const id = this.generateId();
                    const entry = {
                        id,
                        name: r.name,
                        size: r.extractedText.length,
                        status: 'indexed',
                        pages: r.pageCount,
                        extractedText: r.extractedText
                    };
                    this.files.push(entry);
                    this.renderFileList();
                    this.enableChat();
                    this.renderRecentList();
                    this.addSystemMessage('📄 Loaded "' + r.name + '" from recent history. Ask your questions below.');
                    App.toast('✅ ' + r.name + ' loaded');
                },

                deleteRecent(idx) {
                    const r = this.recentPolicies[idx];
                    if (!r) return;
                    const name = r.name;
                    this.recentPolicies.splice(idx, 1);
                    this.files = this.files.filter(f => f.name !== name);
                    this.saveState();
                    this.renderRecentList();
                    this.renderFileList();
                    App.toast('🗑️ ' + name + ' removed');
                },

                // ─── Actions ─────────────────────────────

                clearChat() {
                    this.messages = [];
                    const container = document.getElementById('qnaMessages');
                    if (container) {
                        container.innerHTML = '<div class="qna-msg system">Chat cleared. Upload a document or ask a new question.</div>';
                    }
                    App.toast('🗑️ Chat cleared');
                },

                exportChat() {
                    if (this.messages.length === 0) {
                        App.toast('Nothing to export');
                        return;
                    }
                    const lines = this.messages.map(m => {
                        const prefix = m.role === 'user' ? 'YOU' : m.role === 'ai' ? 'ASSISTANT' : 'SYSTEM';
                        const conf = m.confidence ? ` [${m.confidence.toUpperCase()} confidence]` : '';
                        const cites = m.citations?.length ? ` (Refs: ${m.citations.map(c => c.section).join(', ')})` : '';
                        return `[${prefix}]${conf}${cites}\n${m.text}\n`;
                    }).join('\n---\n\n');

                    const header = `POLICY Q&A TRANSCRIPT\nExported: ${new Date().toLocaleString()}\nFiles: ${this.files.map(f => f.name).join(', ')}\n${'='.repeat(50)}\n\n`;

                    App.downloadFile(header + lines, `PolicyQA_${new Date().toISOString().slice(0,10)}.txt`, 'text/plain');
                    App.toast('📋 Chat exported');
                },

                // ─── Utilities ───────────────────────────

                setProgress(pct) {
                    const bar = document.getElementById('qnaProgress');
                    if (bar) bar.style.width = `${pct}%`;
                    if (pct >= 100) {
                        setTimeout(() => { if (bar) bar.style.width = '0%'; }, 1500);
                    }
                },

                generateId() {
                    return 'qna_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
                },

                fileToBase64(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                },

                escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }
            };

            window.PolicyQA = PolicyQA;
