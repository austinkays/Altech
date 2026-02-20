// EmailComposer - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const EMAIL_STORAGE_KEY = 'altech_email_drafts';

            const EmailComposer = {
                initialized: false,
                _geminiApiKey: null,
                _generating: false,
                _currentOutput: '',
                _tone: 'professional-friendly',

                init() {
                    if (this.initialized) return;
                    this.initialized = true;

                    // Tone chip selection
                    document.querySelectorAll('#emailToneChips .email-tone-chip').forEach(chip => {
                        chip.addEventListener('click', () => {
                            document.querySelectorAll('#emailToneChips .email-tone-chip').forEach(c => c.classList.remove('active'));
                            chip.classList.add('active');
                            this._tone = chip.dataset.tone;
                        });
                    });

                    this.resolveGeminiKey();
                    console.log('[EmailComposer] initialized');
                },

                // ─── API Key ─────────────────────

                async resolveGeminiKey() {
                    const saved = localStorage.getItem('gemini_api_key');
                    if (saved) { this._geminiApiKey = saved; return; }
                    try {
                        const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/places-config') : fetch('/api/places-config'));
                        if (res.ok) { const d = await res.json(); if (d.geminiKey) { this._geminiApiKey = d.geminiKey; return; } }
                    } catch (e) {}
                    try {
                        const res = await fetch('api/config.json');
                        if (res.ok) { const d = await res.json(); if (d.apiKey) { this._geminiApiKey = d.apiKey; return; } }
                    } catch (e) {}
                },

                // ─── Compose ─────────────────────

                async compose() {
                    const draft = document.getElementById('emailDraftInput').value.trim();
                    if (!draft) { App.toast('⚠️ Paste your draft first'); return; }

                    if (!this._geminiApiKey) {
                        const key = prompt('Enter your Google Gemini API key (get one at https://aistudio.google.com/apikey):');
                        if (key && key.trim()) {
                            this._geminiApiKey = key.trim();
                            localStorage.setItem('gemini_api_key', key.trim());
                        } else { return; }
                    }

                    const recipientName = document.getElementById('emailRecipientName').value.trim() || 'the client';
                    const subject = document.getElementById('emailSubject').value.trim();
                    const context = document.getElementById('emailContext').value;
                    const tone = this._tone;

                    const toneGuide = {
                        'professional-friendly': 'Professional but warm and approachable. Use first names. Be helpful without being stiff.',
                        'formal': 'Formal and polished business correspondence. Use "Dear" greetings. Precise language.',
                        'casual': 'Friendly and relaxed, like texting a client you know well. Still professional but conversational.',
                        'urgent': 'Direct and clear with a sense of urgency. Action items are prominent. Firm but polite.',
                        'empathetic': 'Warm, understanding, and supportive. Acknowledge the client\'s situation. Reassuring.'
                    };

                    const contextGuide = {
                        'general': '',
                        'quote-follow-up': 'This is a follow-up about an insurance quote. Include next steps and timeline.',
                        'policy-change': 'Confirming changes made to an existing policy. Be clear about what changed.',
                        'renewal': 'Discussing policy renewal. Mention any premium changes and coverage review.',
                        'claim-update': 'Providing an update on an insurance claim. Be clear about status and next steps.',
                        'new-client-welcome': 'Welcoming a new client to the agency. Be enthusiastic and set expectations.',
                        'missing-info': 'Requesting missing information needed to process something. Be specific about what\'s needed.',
                        'certificate-request': 'Related to a certificate of insurance request. Include relevant details.'
                    };

                    const systemPrompt = `You are Austin, an insurance agent at Altech Insurance Agency. You write emails to clients.

ABOUT AUSTIN'S STYLE:
- Uses first names (never "Dear Sir/Madam")
- Keeps emails concise — gets to the point fast
- Friendly but knowledgeable — clients trust him
- Signs off with "Best," or "Thanks," followed by "Austin" then "Altech Insurance" on the next line
- Uses simple language, avoids jargon unless explaining it
- Often includes a clear call-to-action or next step
- Never uses excessive exclamation marks or emojis in emails

TONE FOR THIS EMAIL: ${toneGuide[tone] || toneGuide['professional-friendly']}

${contextGuide[context] ? 'CONTEXT: ' + contextGuide[context] : ''}

RECIPIENT: ${recipientName}
${subject ? 'SUBJECT: ' + subject : ''}

TASK: Rewrite the following rough draft into a polished, professional email. Keep the same meaning and information but make it sound great. If the draft includes specific numbers, names, or details, preserve them exactly. Output ONLY the email body (no "Subject:" line unless I ask). Start with a greeting.`;

                    this._generating = true;
                    const btn = document.getElementById('emailComposeBtn');
                    btn.disabled = true;
                    btn.textContent = '⏳ Writing...';

                    const outputCard = document.getElementById('emailOutputCard');
                    const outputText = document.getElementById('emailOutputText');
                    outputCard.style.display = 'block';
                    outputText.classList.add('generating');
                    outputText.innerHTML = '<span class="cursor-blink"></span>';
                    this.setProgress(30);

                    try {
                        const response = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this._geminiApiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [
                                        { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\nROUGH DRAFT:\n' + draft }] }
                                    ],
                                    generationConfig: {
                                        temperature: 0.7,
                                        maxOutputTokens: 2048
                                    }
                                })
                            }
                        );

                        this.setProgress(70);

                        if (!response.ok) {
                            const err = await response.text();
                            throw new Error(`Gemini API error: ${response.status} — ${err.slice(0, 200)}`);
                        }

                        const data = await response.json();
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                        if (!text) throw new Error('Empty response from AI');

                        // Streaming effect
                        this._currentOutput = text;
                        await this.streamText(outputText, text);

                        // Try to generate a subject line if one wasn't provided
                        if (!subject) {
                            this.generateSubject(draft, text, recipientName);
                        }

                        this.setProgress(100);
                        App.toast('✨ Email polished!');

                    } catch (err) {
                        console.error('[EmailComposer] Error:', err);
                        outputText.textContent = '❌ Failed to generate: ' + err.message;
                        outputText.classList.remove('generating');
                        App.toast('❌ AI generation failed');
                    } finally {
                        this._generating = false;
                        btn.disabled = false;
                        btn.textContent = '✨ Polish Email';
                        setTimeout(() => this.setProgress(0), 1500);
                    }
                },

                async streamText(el, text) {
                    el.classList.add('generating');
                    el.textContent = '';
                    const words = text.split(' ');
                    for (let i = 0; i < words.length; i++) {
                        el.textContent += (i > 0 ? ' ' : '') + words[i];
                        if (i % 3 === 0) await new Promise(r => setTimeout(r, 15));
                    }
                    el.classList.remove('generating');
                },

                async rewrite() {
                    const draft = document.getElementById('emailDraftInput').value.trim();
                    if (!draft) { App.toast('⚠️ No draft to rewrite'); return; }
                    await this.compose();
                },

                async generateSubject(draft, polished, recipientName) {
                    if (!this._geminiApiKey) return;
                    try {
                        const res = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this._geminiApiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ role: 'user', parts: [{ text: `Generate a concise, professional email subject line for this email to ${recipientName}. Output ONLY the subject line, nothing else.\n\nEMAIL:\n${polished.slice(0, 500)}` }] }],
                                    generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
                                })
                            }
                        );
                        if (res.ok) {
                            const d = await res.json();
                            const subj = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                            if (subj) {
                                document.getElementById('emailSubjectOutput').textContent = subj;
                                document.getElementById('emailSubjectLine').style.display = 'block';
                            }
                        }
                    } catch (e) {}
                },

                // ─── Actions ─────────────────────

                copyOutput() {
                    const text = this._currentOutput;
                    if (!text) { App.toast('⚠️ Nothing to copy'); return; }
                    const subj = document.getElementById('emailSubjectOutput')?.textContent;
                    const full = subj ? `Subject: ${subj}\n\n${text}` : text;
                    navigator.clipboard.writeText(full).then(() => App.toast('📋 Copied to clipboard!'));
                },

                clear() {
                    document.getElementById('emailDraftInput').value = '';
                    document.getElementById('emailRecipientName').value = '';
                    document.getElementById('emailSubject').value = '';
                    document.getElementById('emailContext').value = 'general';
                    document.getElementById('emailOutputCard').style.display = 'none';
                    document.getElementById('emailOutputText').textContent = '';
                    document.getElementById('emailSubjectLine').style.display = 'none';
                    this._currentOutput = '';
                },

                // ─── Encrypted Draft Storage ─────

                async saveDraft() {
                    const output = this._currentOutput;
                    if (!output) { App.toast('⚠️ No email to save'); return; }

                    const draft = {
                        id: CryptoHelper.generateUUID(),
                        recipientName: document.getElementById('emailRecipientName').value.trim(),
                        subject: document.getElementById('emailSubjectOutput')?.textContent || document.getElementById('emailSubject').value.trim(),
                        context: document.getElementById('emailContext').value,
                        tone: this._tone,
                        originalDraft: document.getElementById('emailDraftInput').value.trim(),
                        polishedEmail: output,
                        savedAt: new Date().toISOString()
                    };

                    let drafts = await this.loadDrafts();
                    drafts.unshift(draft);
                    drafts = drafts.slice(0, 50);

                    // Encrypt and save
                    const encrypted = await CryptoHelper.encrypt(drafts);
                    localStorage.setItem(EMAIL_STORAGE_KEY, encrypted);

                    // Also sync encrypted blob to disk
                    fetch('/local/email-drafts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ encrypted })
                    }).catch(() => {});

                    App.toast('💾 Draft saved (encrypted)');
                    this.renderHistory();
                },

                async loadDrafts() {
                    // Try localStorage first
                    const raw = localStorage.getItem(EMAIL_STORAGE_KEY);
                    if (raw) {
                        const decrypted = await CryptoHelper.decrypt(raw);
                        if (Array.isArray(decrypted)) return decrypted;
                    }
                    // Try disk
                    try {
                        const res = await fetch('/local/email-drafts');
                        if (res.ok) {
                            const data = await res.json();
                            if (data.encrypted) {
                                const decrypted = await CryptoHelper.decrypt(data.encrypted);
                                if (Array.isArray(decrypted)) {
                                    // Re-save to localStorage
                                    localStorage.setItem(EMAIL_STORAGE_KEY, data.encrypted);
                                    return decrypted;
                                }
                            }
                        }
                    } catch (e) {}
                    return [];
                },

                async renderHistory() {
                    const container = document.getElementById('emailHistoryList');
                    if (!container) return;
                    const drafts = await this.loadDrafts();
                    if (drafts.length === 0) {
                        container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No saved drafts yet.</p>';
                        return;
                    }
                    container.innerHTML = drafts.map((d, i) => {
                        const date = new Date(d.savedAt);
                        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                        const preview = (d.polishedEmail || '').slice(0, 60) + '…';
                        return `
                            <div class="email-history-item" onclick="EmailComposer.loadDraft(${i})">
                                <div>
                                    <div style="font-weight:600;font-size:14px;">${this.escapeHtml(d.recipientName || 'Client')}${d.subject ? ' — ' + this.escapeHtml(d.subject) : ''}</div>
                                    <div class="email-history-meta">${dateStr} · ${d.context || 'general'} · ${d.tone || 'professional-friendly'}</div>
                                    <div class="email-history-meta" style="margin-top:2px;">${this.escapeHtml(preview)}</div>
                                </div>
                                <div style="display:flex;gap:4px;">
                                    <button onclick="event.stopPropagation();EmailComposer.deleteDraft(${i})" style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px 6px;border-radius:4px;color:#999;" onmouseover="this.style.color='#e53e3e'" onmouseout="this.style.color='#999'">✕</button>
                                </div>
                            </div>
                        `;
                    }).join('');
                },

                async loadDraft(idx) {
                    const drafts = await this.loadDrafts();
                    const d = drafts[idx];
                    if (!d) return;

                    document.getElementById('emailRecipientName').value = d.recipientName || '';
                    document.getElementById('emailSubject').value = d.subject || '';
                    document.getElementById('emailContext').value = d.context || 'general';
                    document.getElementById('emailDraftInput').value = d.originalDraft || '';

                    // Restore tone chip
                    if (d.tone) {
                        document.querySelectorAll('#emailToneChips .email-tone-chip').forEach(c => {
                            c.classList.toggle('active', c.dataset.tone === d.tone);
                        });
                        this._tone = d.tone;
                    }

                    // Show output
                    this._currentOutput = d.polishedEmail || '';
                    const outputCard = document.getElementById('emailOutputCard');
                    const outputText = document.getElementById('emailOutputText');
                    outputCard.style.display = 'block';
                    outputText.textContent = d.polishedEmail || '';
                    outputText.classList.remove('generating');

                    if (d.subject) {
                        document.getElementById('emailSubjectOutput').textContent = d.subject;
                        document.getElementById('emailSubjectLine').style.display = 'block';
                    }

                    App.toast('📄 Draft loaded');
                    window.scrollTo(0, 0);
                },

                async deleteDraft(idx) {
                    let drafts = await this.loadDrafts();
                    drafts.splice(idx, 1);
                    const encrypted = await CryptoHelper.encrypt(drafts);
                    localStorage.setItem(EMAIL_STORAGE_KEY, encrypted);
                    fetch('/local/email-drafts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ encrypted })
                    }).catch(() => {});
                    this.renderHistory();
                    App.toast('🗑️ Draft deleted');
                },

                // ─── Helpers ─────────────────────

                setProgress(pct) {
                    const bar = document.getElementById('emailProgress');
                    if (bar) bar.style.width = pct + '%';
                },

                escapeHtml(text) {
                    if (!text) return '';
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }
            };

            window.EmailComposer = EmailComposer;
