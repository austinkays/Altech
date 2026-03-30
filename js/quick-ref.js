// QuickRef - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const QR_STORAGE_KEY = 'altech_quickref_cards';
const QR_NUMBERS_KEY = 'altech_quickref_numbers';
const QR_EMOJIS_KEY  = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.QUICKREF_EMOJIS : 'altech_quickref_emojis';
const QR_MAX_EMOJIS  = 12;

const QR_DEFAULT_EMOJIS = [
    { emoji: '✅', label: 'Done' },
    { emoji: '📁', label: 'Logged' },
    { emoji: '⚠️', label: 'Pending' },
    { emoji: '🔄', label: 'Follow-up' },
    { emoji: '✉️', label: 'Emailed' },
    { emoji: '📞', label: 'Called' },
];

const QR_EMOJI_PICKER_OPTIONS = [
    // ── Status ──
    { emoji: '✅', label: 'Done', category: 'Status' },
    { emoji: '⚠️', label: 'Pending', category: 'Status' },
    { emoji: '❌', label: 'Cancelled', category: 'Status' },
    { emoji: '🔄', label: 'Follow-up', category: 'Status' },
    { emoji: '⏳', label: 'Waiting', category: 'Status' },
    { emoji: '🔒', label: 'Locked', category: 'Status' },
    { emoji: '🔓', label: 'Unlocked', category: 'Status' },
    { emoji: '🚫', label: 'Blocked', category: 'Status' },
    { emoji: '⭐', label: 'Priority', category: 'Status' },
    { emoji: '🏁', label: 'Complete', category: 'Status' },
    // ── Communication ──
    { emoji: '📞', label: 'Called', category: 'Communication' },
    { emoji: '✉️', label: 'Emailed', category: 'Communication' },
    { emoji: '💬', label: 'Texted', category: 'Communication' },
    { emoji: '📩', label: 'Received', category: 'Communication' },
    { emoji: '📤', label: 'Sent', category: 'Communication' },
    { emoji: '📥', label: 'Inbox', category: 'Communication' },
    { emoji: '📱', label: 'Mobile', category: 'Communication' },
    { emoji: '🤝', label: 'Meeting', category: 'Communication' },
    { emoji: '📋', label: 'Clipboard', category: 'Communication' },
    // ── Documentation ──
    { emoji: '📁', label: 'Logged', category: 'Documentation' },
    { emoji: '📝', label: 'Note', category: 'Documentation' },
    { emoji: '📄', label: 'Document', category: 'Documentation' },
    { emoji: '🗂️', label: 'Filed', category: 'Documentation' },
    { emoji: '📑', label: 'Bookmarked', category: 'Documentation' },
    { emoji: '🔖', label: 'Tagged', category: 'Documentation' },
    { emoji: '📎', label: 'Attached', category: 'Documentation' },
    { emoji: '🖨️', label: 'Printed', category: 'Documentation' },
    // ── Property & Auto ──
    { emoji: '🏠', label: 'Home', category: 'Property & Auto' },
    { emoji: '🏢', label: 'Commercial', category: 'Property & Auto' },
    { emoji: '🚗', label: 'Auto', category: 'Property & Auto' },
    { emoji: '🔑', label: 'Keys', category: 'Property & Auto' },
    { emoji: '🏗️', label: 'Construction', category: 'Property & Auto' },
    { emoji: '🚧', label: 'Hazard', category: 'Property & Auto' },
    { emoji: '🌊', label: 'Flood', category: 'Property & Auto' },
    { emoji: '🔥', label: 'Fire', category: 'Property & Auto' },
    // ── Finance ──
    { emoji: '💰', label: 'Payment', category: 'Finance' },
    { emoji: '💵', label: 'Cash', category: 'Finance' },
    { emoji: '💳', label: 'Card', category: 'Finance' },
    { emoji: '🧾', label: 'Receipt', category: 'Finance' },
    { emoji: '📊', label: 'Report', category: 'Finance' },
    { emoji: '💲', label: 'Premium', category: 'Finance' },
    // ── Time ──
    { emoji: '⏰', label: 'Reminder', category: 'Time' },
    { emoji: '📅', label: 'Scheduled', category: 'Time' },
    { emoji: '🗓️', label: 'Calendar', category: 'Time' },
    { emoji: '⏱️', label: 'Timer', category: 'Time' },
    { emoji: '🕐', label: 'Clock', category: 'Time' },
    { emoji: '📆', label: 'Due Date', category: 'Time' },
    // ── People & Misc ──
    { emoji: '👤', label: 'Client', category: 'People' },
    { emoji: '👥', label: 'Group', category: 'People' },
    { emoji: '🏆', label: 'Winner', category: 'People' },
    { emoji: '👍', label: 'Approved', category: 'People' },
    { emoji: '👎', label: 'Declined', category: 'People' },
    { emoji: '🎉', label: 'Celebration', category: 'People' },
];

const PHONETIC_ALPHABET = {
    A:'Adam',B:'Boy',C:'Charles',D:'David',E:'Edward',F:'Frank',
    G:'George',H:'Henry',I:'Ida',J:'John',K:'King',L:'Lincoln',
    M:'Mary',N:'Nora',O:'Ocean',P:'Paul',Q:'Queen',R:'Robert',
    S:'Sam',T:'Tom',U:'Union',V:'Victor',W:'William',
    X:'X-ray',Y:'Young',Z:'Zebra',
    '0':'Zero','1':'One','2':'Two','3':'Three','4':'Four',
    '5':'Five','6':'Six','7':'Seven','8':'Eight','9':'Nine'
};
// Alias for backward compat
const NATO = PHONETIC_ALPHABET;

const QuickRef = {
    initialized: false,
    cards: [],
    numbers: [],
    emojis: [],
    sortMode: 'default', // 'default' | 'alpha'

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.buildPhoneticGrid();
        this.loadCards();
        this.renderCards();
        this.loadNumbers();
        this.renderNumbers();
        this.loadEmojis();
        this.renderEmojis();
        this.loadSectionStates();
        console.log('[QuickRef] initialized');
    },

    // ─── Collapsible Sections ────────

    toggleSection(id) {
        const el = document.getElementById('qrs-' + id);
        if (!el) return;
        el.classList.toggle('collapsed');
        const collapsed = Utils.tryParseLS('altech_quickref_sections', {});
        collapsed[id] = el.classList.contains('collapsed');
        localStorage.setItem('altech_quickref_sections', JSON.stringify(collapsed));
    },

    loadSectionStates() {
        const collapsed = Utils.tryParseLS('altech_quickref_sections', {});
        Object.entries(collapsed).forEach(([id, isCollapsed]) => {
            if (isCollapsed) {
                const el = document.getElementById('qrs-' + id);
                if (el) el.classList.add('collapsed');
            }
        });
    },

    // ─── Phonetic Grid ──────────────

    buildPhoneticGrid() {
        const grid = document.getElementById('qrPhoneticGrid');
        if (!grid) return;
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        grid.innerHTML = letters.map(ch => `
            <div class="qr-phonetic-cell" data-letter="${ch}">
                <div class="qr-phonetic-letter">${ch}</div>
                <div class="qr-phonetic-word">${NATO[ch] || ch}</div>
            </div>
        `).join('');
    },

    // ─── Speller ────────────────────

    spell(text) {
        const output = document.getElementById('qrSpellerOutput');
        const clearBtn = document.getElementById('qrSpellerClear');
        if (!output) return;

        if (clearBtn) clearBtn.style.display = text ? 'flex' : 'none';

        const upper = (text || '').toUpperCase();

        // Highlight phonetic grid cells
        const usedLetters = new Set(upper.replace(/[^A-Z0-9]/g, '').split(''));
        document.querySelectorAll('#qrPhoneticGrid .qr-phonetic-cell').forEach(cell => {
            cell.classList.toggle('highlight', usedLetters.has(cell.dataset.letter));
        });

        if (!upper.trim()) { output.innerHTML = ''; return; }

        output.innerHTML = upper.split('').map(ch => {
            if (ch === ' ') return '<span class="qr-speller-item space"><span class="qr-spell-word">space</span></span>';
            const word = NATO[ch];
            if (!word) return `<span class="qr-speller-item"><span class="qr-spell-letter">${this.escHtml(ch)}</span><span class="qr-spell-word">${this.escHtml(ch)}</span></span>`;
            return `<span class="qr-speller-item"><span class="qr-spell-letter">${this.escHtml(ch)}</span><span class="qr-spell-word">${word}</span></span>`;
        }).join('');
    },

    clearSpeller() {
        const input = document.getElementById('qrSpellerInput');
        const clearBtn = document.getElementById('qrSpellerClear');
        if (input) { input.value = ''; input.focus(); }
        if (clearBtn) clearBtn.style.display = 'none';
        this.spell('');
    },

    // ─── Card CRUD ──────────────────

    getDefaultCards() {
        return [
            {
                id: 'default-1',
                carrier: 'Progressive',
                color: '#0052cc',
                fields: [
                    { label: 'Agent Code', value: '78119' },
                    { label: 'Phone', value: '1-800-776-4737' }
                ]
            },
            {
                id: 'default-2',
                carrier: 'Safeco',
                color: '#005a30',
                fields: [
                    { label: 'Agent Code', value: '013575' },
                    { label: 'Phone', value: '1-800-332-3226' }
                ]
            },
            {
                id: 'default-3',
                carrier: 'Travelers',
                color: '#cc0000',
                fields: [
                    { label: 'Agency Code', value: '0cfj97' },
                    { label: 'Phone', value: '1-800-842-5075' }
                ]
            },
            {
                id: 'default-4',
                carrier: 'Mutual of Enumclaw',
                color: '#1a5276',
                fields: [
                    { label: 'Agent Code', value: '0057' },
                    { label: 'Phone', value: '1-800-892-4191' }
                ]
            }
        ];
    },

    loadCards() {
        // Try localStorage
        const raw = localStorage.getItem(QR_STORAGE_KEY);
        if (raw) {
            try { this.cards = JSON.parse(raw); return; } catch(e) {}
        }
        // Try disk
        fetch('/local/quickref-cards').then(r => r.ok ? r.json() : null).then(data => {
            if (data && Array.isArray(data.cards) && data.cards.length) {
                this.cards = data.cards;
                this.persistLocal();
                this.renderCards();
            }
        }).catch(() => {});
        // Defaults
        this.cards = this.getDefaultCards();
    },

    persistLocal() {
        localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(this.cards));
    },

    syncToDisk() {
        fetch('/local/quickref-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards: this.cards })
        }).catch(() => {});
    },

    save() {
        this.persistLocal();
        this.syncToDisk();
        // Trigger cloud sync if available
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    renderCards() {
        const grid = document.getElementById('qrCardsGrid');
        if (!grid) return;
        if (this.cards.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; grid-column: 1/-1;">No cards yet. Click "+ Add Card" to create one.</p>';
            return;
        }

        // Build indexed array so we always pass the original index to edit/delete/star
        let indexed = this.cards.map((card, i) => ({ card, origIdx: i }));

        if (this.sortMode === 'alpha') {
            indexed.sort((a, b) => {
                // Starred first, then A–Z
                if (!!b.card.starred !== !!a.card.starred) return b.card.starred ? 1 : -1;
                return a.card.carrier.localeCompare(b.card.carrier);
            });
        } else {
            // Default: starred float to top, otherwise preserve insertion order
            indexed.sort((a, b) => {
                if (!!b.card.starred !== !!a.card.starred) return b.card.starred ? 1 : -1;
                return 0;
            });
        }

        grid.innerHTML = indexed.map(({ card, origIdx }) => `
            <div class="qr-card${card.starred ? ' starred' : ''}">
                <button class="qr-card-star${card.starred ? ' active' : ''}"
                    onclick="QuickRef.toggleStar(${origIdx})"
                    title="${card.starred ? 'Unstar' : 'Star — pins to top'}">
                    ${card.starred ? '⭐' : '☆'}
                </button>
                <div class="qr-card-actions">
                    <button class="qr-card-btn" onclick="QuickRef.editCard(${origIdx})" title="Edit">✏️</button>
                    <button class="qr-card-btn delete" onclick="QuickRef.deleteCard(${origIdx})" title="Delete">✕</button>
                </div>
                <div class="qr-card-carrier">
                    <span class="qr-carrier-dot" style="background:${card.color || '#0d9488'}"></span>
                    ${this.escHtml(card.carrier)}
                </div>
                ${card.fields.map(f => `
                    <div class="qr-card-field">
                        <span>${this.escHtml(f.label)}</span>
                        <span class="qr-card-value" onclick="QuickRef.copyVal(this)">${this.escHtml(f.value) || '—'}</span>
                    </div>
                `).join('')}
            </div>
        `).join('');
    },

    toggleStar(idx) {
        if (!this.cards[idx]) return;
        this.cards[idx].starred = !this.cards[idx].starred;
        this.save();
        this.renderCards();
        App.toast(this.cards[idx].starred ? '⭐ Pinned to top' : '☆ Unpinned');
    },

    toggleSort() {
        this.sortMode = this.sortMode === 'alpha' ? 'default' : 'alpha';
        const btn = document.getElementById('qrSortBtn');
        if (btn) {
            btn.textContent = this.sortMode === 'alpha' ? '↺ Default' : 'A–Z';
            btn.classList.toggle('active', this.sortMode === 'alpha');
            btn.classList.toggle('qr-sort-btn', true);
        }
        this.renderCards();
    },

    // Copy a value on click
    copyVal(el) {
        const text = el.textContent.trim();
        if (!text || text === '—') return;
        navigator.clipboard.writeText(text).then(() => {
            el.classList.add('copied');
            el.dataset.orig = el.textContent;
            el.textContent = '✓ copied';
            setTimeout(() => { el.textContent = el.dataset.orig; el.classList.remove('copied'); }, 1200);
        });
    },

    // ─── Add / Edit ─────────────────

    toggleAddForm() {
        const form = document.getElementById('qrAddForm');
        form.classList.toggle('active');
        if (form.classList.contains('active')) {
            document.getElementById('qrAddCarrier').value = '';
            document.getElementById('qrAddColor').value = '#0d9488';
            document.getElementById('qrAddFieldsList').innerHTML = `
                <div class="qr-add-field-row">
                    <input type="text" class="qr-add-input" placeholder="Label (e.g. Agent ID)" data-role="label">
                    <input type="text" class="qr-add-input" placeholder="Value (e.g. A12345)" data-role="value">
                    <button class="qr-card-btn delete" onclick="this.parentElement.remove()" title="Remove">✕</button>
                </div>
            `;
            delete form.dataset.editIdx;
            document.getElementById('qrAddCarrier').focus();
        }
    },

    addFieldRow() {
        const list = document.getElementById('qrAddFieldsList');
        const row = document.createElement('div');
        row.className = 'qr-add-field-row';
        row.innerHTML = `
            <input type="text" class="qr-add-input" placeholder="Label" data-role="label">
            <input type="text" class="qr-add-input" placeholder="Value" data-role="value">
            <button class="qr-card-btn delete" onclick="this.parentElement.remove()" title="Remove">✕</button>
        `;
        list.appendChild(row);
        row.querySelector('[data-role="label"]').focus();
    },

    saveNewCard() {
        const carrier = document.getElementById('qrAddCarrier').value.trim();
        if (!carrier) { App.toast('⚠️ Enter a carrier name'); return; }
        const color = document.getElementById('qrAddColor').value;
        const rows = document.querySelectorAll('#qrAddFieldsList .qr-add-field-row');
        const fields = [];
        rows.forEach(row => {
            const label = row.querySelector('[data-role="label"]').value.trim();
            const value = row.querySelector('[data-role="value"]').value.trim();
            if (label || value) fields.push({ label: label || 'Info', value });
        });
        if (fields.length === 0) { App.toast('⚠️ Add at least one field'); return; }

        const form = document.getElementById('qrAddForm');
        const editIdx = form.dataset.editIdx;

        if (editIdx !== undefined) {
            // Edit existing
            this.cards[parseInt(editIdx)] = { id: this.cards[parseInt(editIdx)].id, carrier, color, fields };
        } else {
            // New card
            this.cards.push({ id: 'card-' + Date.now(), carrier, color, fields });
        }

        this.save();
        this.renderCards();
        this.toggleAddForm();
        App.toast(editIdx !== undefined ? '✏️ Card updated' : '✅ Card added');
    },

    editCard(idx) {
        const card = this.cards[idx];
        if (!card) return;
        const form = document.getElementById('qrAddForm');
        form.classList.add('active');
        form.dataset.editIdx = idx;
        document.getElementById('qrAddCarrier').value = card.carrier;
        document.getElementById('qrAddColor').value = card.color || '#0d9488';
        const list = document.getElementById('qrAddFieldsList');
        list.innerHTML = card.fields.map(f => `
            <div class="qr-add-field-row">
                <input type="text" class="qr-add-input" placeholder="Label" data-role="label" value="${this.escAttr(f.label)}">
                <input type="text" class="qr-add-input" placeholder="Value" data-role="value" value="${this.escAttr(f.value)}">
                <button class="qr-card-btn delete" onclick="this.parentElement.remove()" title="Remove">✕</button>
            </div>
        `).join('');
        document.getElementById('qrAddCarrier').focus();
    },

    deleteCard(idx) {
        this.cards.splice(idx, 1);
        this.save();
        this.renderCards();
        App.toast('🗑️ Card removed');
    },

    // ─── Quick Dial Numbers CRUD ──────

    getDefaultNumbers() {
        return [
            { id: 'num-1', label: 'NAIC Lookup', value: 'naic.org/cis_consumer_information_look_up.htm' },
            { id: 'num-2', label: 'CLUE Report', value: '1-866-312-8076' },
            { id: 'num-3', label: 'MVR Check', value: '1-800-777-9929' }
        ];
    },

    loadNumbers() {
        const raw = localStorage.getItem(QR_NUMBERS_KEY);
        if (raw) {
            try { this.numbers = JSON.parse(raw); return; } catch(e) {}
        }
        this.numbers = this.getDefaultNumbers();
    },

    saveNumbers() {
        localStorage.setItem(QR_NUMBERS_KEY, JSON.stringify(this.numbers));
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    renderNumbers() {
        const container = document.getElementById('qrNumbersList');
        if (!container) return;
        if (this.numbers.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No numbers saved. Click "+ Add Number" to add one.</p>';
            return;
        }
        container.innerHTML = this.numbers.map((n, i) => `
            <div class="qr-number-row">
                <span class="qr-number-label">${this.escHtml(n.label)}</span>
                <span class="qr-card-value" onclick="QuickRef.copyVal(this)">${this.escHtml(n.value)}</span>
                <span class="qr-number-actions">
                    <button class="qr-card-btn" onclick="QuickRef.editNumber(${i})" title="Edit">✏️</button>
                    <button class="qr-card-btn delete" onclick="QuickRef.deleteNumber(${i})" title="Delete">✕</button>
                </span>
            </div>
        `).join('');
    },

    toggleNumberForm() {
        const form = document.getElementById('qrNumberForm');
        form.classList.toggle('active');
        if (form.classList.contains('active')) {
            document.getElementById('qrNumLabel').value = '';
            document.getElementById('qrNumValue').value = '';
            delete form.dataset.editIdx;
            document.getElementById('qrNumLabel').focus();
        }
    },

    saveNumber() {
        const label = document.getElementById('qrNumLabel').value.trim();
        const value = document.getElementById('qrNumValue').value.trim();
        if (!label || !value) { App.toast('⚠️ Enter both label and value'); return; }
        const form = document.getElementById('qrNumberForm');
        const editIdx = form.dataset.editIdx;
        if (editIdx !== undefined) {
            this.numbers[parseInt(editIdx)] = { ...this.numbers[parseInt(editIdx)], label, value };
        } else {
            this.numbers.push({ id: 'num-' + Date.now(), label, value });
        }
        this.saveNumbers();
        this.renderNumbers();
        this.toggleNumberForm();
        App.toast(editIdx !== undefined ? '✏️ Number updated' : '✅ Number added');
    },

    editNumber(idx) {
        const n = this.numbers[idx];
        if (!n) return;
        const form = document.getElementById('qrNumberForm');
        form.classList.add('active');
        form.dataset.editIdx = idx;
        document.getElementById('qrNumLabel').value = n.label;
        document.getElementById('qrNumValue').value = n.value;
        document.getElementById('qrNumLabel').focus();
    },

    deleteNumber(idx) {
        this.numbers.splice(idx, 1);
        this.saveNumbers();
        this.renderNumbers();
        App.toast('🗑️ Number removed');
    },

    // ─── Quick Emojis ────────────────

    loadEmojis() {
        const raw = localStorage.getItem(QR_EMOJIS_KEY);
        if (raw) {
            try { this.emojis = JSON.parse(raw); return; } catch(e) {}
        }
        this.emojis = QR_DEFAULT_EMOJIS.map(e => ({ ...e }));
    },

    saveEmojis() {
        localStorage.setItem(QR_EMOJIS_KEY, JSON.stringify(this.emojis));
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    renderEmojis() {
        const container = document.getElementById('qrEmojiGrid');
        if (!container) return;

        const esc = (s) => typeof Utils !== 'undefined' ? Utils.escapeHTML(s) : this.escHtml(s);
        const atLimit = this.emojis.length >= QR_MAX_EMOJIS;

        container.innerHTML = this.emojis.map((e, i) => `
            <div class="qr-emoji-btn-wrap">
                <button class="qr-emoji-btn" onclick="QuickRef.copyEmoji('${this.escAttr(e.emoji)}', this)">
                    <span class="qr-emoji-icon">${esc(e.emoji)}</span>
                    <span class="qr-emoji-label">${esc(e.label)}</span>
                </button>
                <span class="qr-emoji-actions">
                    <button class="qr-emoji-action-btn" onclick="QuickRef.editEmojiLabel(${i})" title="Edit label">✏️</button>
                    <button class="qr-emoji-action-btn delete" onclick="QuickRef.deleteEmoji(${i})" title="Remove">✕</button>
                </span>
            </div>
        `).join('') + (!atLimit ? `
            <button class="qr-emoji-btn qr-emoji-add-btn" onclick="QuickRef.openEmojiPicker()" title="Add emoji">
                <span class="qr-emoji-icon">＋</span>
                <span class="qr-emoji-label">Add</span>
            </button>
        ` : '');

        // Update the header add button visibility
        const headerBtn = document.getElementById('qrEmojiAddBtn');
        if (headerBtn) headerBtn.style.display = atLimit ? 'none' : '';
    },

    openEmojiPicker() {
        if (this.emojis.length >= QR_MAX_EMOJIS) {
            App.toast('⚠️ Maximum ' + QR_MAX_EMOJIS + ' emojis reached');
            return;
        }
        const existing = document.getElementById('qrEmojiPicker');
        if (existing) {
            existing.classList.toggle('active');
            return;
        }
        // Build the picker
        const picker = document.createElement('div');
        picker.id = 'qrEmojiPicker';
        picker.className = 'qr-emoji-picker active';
        this._renderPickerContent(picker);

        // Insert after the emoji grid
        const grid = document.getElementById('qrEmojiGrid');
        if (grid) grid.parentNode.insertBefore(picker, grid.nextSibling);
    },

    _renderPickerContent(picker) {
        const selectedEmojis = new Set(this.emojis.map(e => e.emoji));
        const categories = {};
        QR_EMOJI_PICKER_OPTIONS.forEach(opt => {
            if (!categories[opt.category]) categories[opt.category] = [];
            categories[opt.category].push(opt);
        });

        const esc = (s) => typeof Utils !== 'undefined' ? Utils.escapeHTML(s) : this.escHtml(s);
        let html = '<div class="qr-emoji-picker-header"><span>Choose an emoji</span><button class="qr-emoji-picker-close" onclick="QuickRef.closeEmojiPicker()">✕</button></div>';

        for (const [cat, opts] of Object.entries(categories)) {
            html += `<div class="qr-emoji-picker-category">${esc(cat)}</div>`;
            html += '<div class="qr-emoji-picker-grid">';
            opts.forEach(opt => {
                const isSelected = selectedEmojis.has(opt.emoji);
                html += `<button class="qr-emoji-picker-item${isSelected ? ' selected' : ''}" onclick="QuickRef.pickEmoji('${this.escAttr(opt.emoji)}', '${this.escAttr(opt.label)}')" title="${this.escAttr(opt.label)}"${isSelected ? ' disabled' : ''}>
                    <span class="qr-emoji-picker-icon">${esc(opt.emoji)}</span>
                    <span class="qr-emoji-picker-label">${esc(opt.label)}</span>
                    ${isSelected ? '<span class="qr-emoji-picker-check">✓</span>' : ''}
                </button>`;
            });
            html += '</div>';
        }
        picker.innerHTML = html;
    },

    closeEmojiPicker() {
        const picker = document.getElementById('qrEmojiPicker');
        if (picker) picker.classList.remove('active');
    },

    pickEmoji(emoji, label) {
        if (this.emojis.length >= QR_MAX_EMOJIS) {
            App.toast('⚠️ Maximum ' + QR_MAX_EMOJIS + ' emojis reached');
            return;
        }
        // Don't add duplicates
        if (this.emojis.some(e => e.emoji === emoji)) {
            App.toast('⚠️ Emoji already added');
            return;
        }
        this.emojis.push({ emoji, label });
        this.saveEmojis();
        this.renderEmojis();
        // Refresh picker to show updated checkmarks
        const picker = document.getElementById('qrEmojiPicker');
        if (picker) this._renderPickerContent(picker);
        App.toast('✅ Emoji added');
        // Auto-close picker at limit
        if (this.emojis.length >= QR_MAX_EMOJIS) this.closeEmojiPicker();
    },

    editEmojiLabel(idx) {
        const e = this.emojis[idx];
        if (!e) return;
        const wrap = document.querySelectorAll('.qr-emoji-btn-wrap')[idx];
        if (!wrap) return;
        const labelEl = wrap.querySelector('.qr-emoji-label');
        if (!labelEl || labelEl.dataset.editing) return;

        const origLabel = e.label;
        labelEl.dataset.editing = 'true';
        labelEl.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'qr-emoji-label-input';
        input.value = origLabel;
        input.maxLength = 20;
        labelEl.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
            const newLabel = input.value.trim() || origLabel;
            delete labelEl.dataset.editing;
            this.emojis[idx].label = newLabel;
            this.saveEmojis();
            this.renderEmojis();
        };
        const cancel = () => {
            delete labelEl.dataset.editing;
            this.renderEmojis();
        };
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); save(); }
            if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', save);
    },

    deleteEmoji(idx) {
        this.emojis.splice(idx, 1);
        this.saveEmojis();
        this.renderEmojis();
        // Refresh picker if open
        const picker = document.getElementById('qrEmojiPicker');
        if (picker && picker.classList.contains('active')) this._renderPickerContent(picker);
        App.toast('🗑️ Emoji removed');
    },

    resetEmojisToDefault() {
        this.emojis = QR_DEFAULT_EMOJIS.map(e => ({ ...e }));
        this.saveEmojis();
        this.renderEmojis();
        const picker = document.getElementById('qrEmojiPicker');
        if (picker && picker.classList.contains('active')) this._renderPickerContent(picker);
        App.toast('↩️ Emojis reset to defaults');
    },

    copyEmoji(emoji, btn) {
        navigator.clipboard.writeText(emoji).then(() => {
            const labelEl = btn.querySelector('.qr-emoji-label');
            const iconEl = btn.querySelector('.qr-emoji-icon');
            const origLabel = labelEl ? labelEl.textContent : '';
            const origIcon = iconEl ? iconEl.textContent : '';
            btn.classList.add('copied');
            if (iconEl) iconEl.textContent = '✓';
            if (labelEl) labelEl.textContent = 'Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                if (iconEl) iconEl.textContent = origIcon;
                if (labelEl) labelEl.textContent = origLabel;
            }, 1200);
            App.toast('📋 Emoji copied');
        });
    },

    // ─── Helpers ────────────────────

    escHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    },

    escAttr(text) {
        if (!text) return '';
        return String(text).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
};

window.QuickRef = QuickRef;
