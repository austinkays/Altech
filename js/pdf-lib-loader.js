/**
 * PDF library lazy-loader.
 *
 * Lazy-loads ~600 KB of PDF-related CDN libraries only when a feature needs them.
 * Callers: `await PDFLibs.ensure('jspdf')` before `new jsPDF()` etc.
 *
 * Supported keys: 'jspdf' | 'jszip' | 'pdfjs' | 'pdflib'
 * Passing an array loads multiple in parallel: `await PDFLibs.ensure(['jspdf', 'jszip'])`
 *
 * Idempotent: if the lib is already on window (e.g. a cached service worker
 * loaded it) or a prior call is in flight, returns the existing Promise.
 */
(function () {
    'use strict';

    const PDFJS_VERSION = '3.11.174';

    const SOURCES = {
        jspdf:  { url: 'lib/jspdf.umd.min.js',                                                         test: () => window.jspdf || window.jsPDF },
        jszip:  { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',             test: () => window.JSZip },
        pdfjs:  { url: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`,    test: () => window.pdfjsLib, after: () => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
            }
        }},
        pdflib: { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',         test: () => window.PDFLib },
    };

    const cache = {}; // key -> Promise<void>

    function loadOne(key) {
        const cfg = SOURCES[key];
        if (!cfg) return Promise.reject(new Error(`Unknown PDF lib: ${key}`));
        if (cfg.test()) return Promise.resolve();
        if (cache[key]) return cache[key];

        cache[key] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = cfg.url;
            s.async = true;
            s.onload = () => {
                try { if (cfg.after) cfg.after(); } catch (_) {}
                resolve();
            };
            s.onerror = () => {
                delete cache[key];
                reject(new Error(`Failed to load ${key}. Check your internet connection.`));
            };
            document.head.appendChild(s);
        });
        return cache[key];
    }

    function ensure(keys) {
        const arr = Array.isArray(keys) ? keys : [keys];
        return Promise.all(arr.map(loadOne)).then(() => undefined);
    }

    window.PDFLibs = { ensure };
})();
