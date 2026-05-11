// js/app-export-csv.js — CSV export + batch-import engine
// Extracted from app-export.js during Phase 4 monolith decomposition
'use strict';

Object.assign(App, {
    exportCSV() {
        const result = this.buildCSV(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('CSV', result.filename);
        this.toast('\u{1F525} CSV Generated!');
    },

    buildCSV(data) {
        const h = this.getCSVHeaders();
        const flatNotes = this.getNotesForData(data).replace(/\n/g, ' | ');
        const driversSummary = (data.drivers || []).map((d, i) => {
            const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
            return `Driver ${i + 1}: ${name || 'Unknown'} (${d.occupation || 'N/A'})`;
        }).join(' | ');
        const row = [
            data.firstName, data.lastName, data.addrStreet, data.addrCity, data.addrState, data.addrZip,
            data.phone, data.email, data.dob, flatNotes, data.qType, driversSummary
        ].map(v => `"${v||''}"`).join(',');

        const csv = h.join(',') + "\n" + row;
        return { content: csv, filename: `Lead_${App._safeFileNamePart(data.lastName, 'Export')}.csv`, mime: 'text/csv' };
    },

    getCSVHeaders() {
        return ["First Name","Last Name","Address Line 1","City","State Code","Zip Code","Mobile Phone","Email","Date of Birth","Notes","Quote Type","Drivers/Occupations"];
    },

    downloadCSVTemplate() {
        const headers = this.getCSVHeaders();
        const sample = [
            'Jane','Doe','123 Main St','Seattle','WA','98101','2065551212','jane@example.com','1985-05-12','Follow up','home','Driver 1: Jane Doe (Engineer)'
        ].map(v => `"${v}"`).join(',');
        const content = `${headers.join(',')}\n${sample}`;
        this.downloadFile(content, 'Altech_Batch_Template.csv', 'text/csv');
        this.toast('\u{1F4C4} CSV template downloaded');
    },

    openBatchImport() {
        const input = document.getElementById('batchCsvInput');
        if (!input) return;
        input.value = '';
        input.click();
    },

    async handleBatchImport(file) {
        if (!file) return;
        const text = await file.text();
        const parsed = this.parseCSV(text);
        if (!parsed || !parsed.rows.length) {
            this.toast('\u26A0\uFE0F CSV has no rows.');
            return;
        }

        const quotes = await this.getQuotes();
        const errors = [];
        let created = 0;

        parsed.rows.forEach((row, index) => {
            const data = this.mapCsvRowToData(parsed.headers, row);
            if (!data.addrStreet || !data.addrCity || !data.addrState) {
                errors.push(`Row ${index + 2}: Missing address fields`);
                return;
            }

            const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            const title = this.getQuoteTitle(data);
            quotes.unshift({
                id,
                title,
                data,
                updatedAt: new Date().toISOString(),
                starred: false,
                isDuplicate: false
            });
            created += 1;
        });

        await this.saveQuotes(quotes);
        await this.renderQuoteList();

        if (created) {
            this.toast(`\u2705 Imported ${created} draft${created > 1 ? 's' : ''}`);
        }
        if (errors.length) {
            console.warn('Batch import warnings:', errors);
            this.toast('\u26A0\uFE0F Some rows were skipped.');
        }
    },

    parseCSV(text) {
        if (!text) return { headers: [], rows: [] };
        const rows = [];
        let cur = '';
        let row = [];
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const next = text[i + 1];

            if (ch === '"') {
                if (inQuotes && next === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (ch === ',' && !inQuotes) {
                row.push(cur);
                cur = '';
                continue;
            }

            if ((ch === '\n' || ch === '\r') && !inQuotes) {
                if (ch === '\r' && next === '\n') i++;
                row.push(cur);
                cur = '';
                if (row.some(cell => cell.trim().length)) {
                    rows.push(row);
                }
                row = [];
                continue;
            }

            cur += ch;
        }

        if (cur.length || row.length) {
            row.push(cur);
            if (row.some(cell => cell.trim().length)) {
                rows.push(row);
            }
        }

        const headers = (rows.shift() || []).map(h => h.trim());
        return { headers, rows };
    },

    mapCsvRowToData(headers, row) {
        const data = {};
        headers.forEach((header, i) => {
            const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            const value = (row[i] || '').trim();

            const map = {
                firstname: 'firstName',
                lastname: 'lastName',
                addressline1: 'addrStreet',
                city: 'addrCity',
                statecode: 'addrState',
                zipcode: 'addrZip',
                mobilephone: 'phone',
                email: 'email',
                dateofbirth: 'dob',
                notes: 'importNotes',
                quotetype: 'qType'
            };

            const field = map[key];
            if (field) data[field] = value;
        });

        if (data.addrState) data.addrState = data.addrState.toUpperCase();
        if (data.qType) {
            const qt = data.qType.toLowerCase();
            if (['home','auto','both'].includes(qt)) data.qType = qt;
        }
        return data;
    },
});
