/**
 * Certificate of Insurance (COI) Generator API
 *
 * Fills the real ACORD 25 fillable PDF using PyPDF2 (via Python subprocess).
 * Endpoint: POST /api/generate-coi
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { securityMiddleware } from './_security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root (one level up from api/)
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Possible Python executable paths
const PYTHON_CANDIDATES = [
    path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe'),   // Windows venv
    path.join(PROJECT_ROOT, '.venv', 'bin', 'python'),            // Linux/Mac venv
    'python3',
    'python',
];

function findPython() {
    for (const candidate of PYTHON_CANDIDATES) {
        try {
            execFileSync(candidate, ['--version'], { stdio: 'pipe', timeout: 5000 });
            return candidate;
        } catch {
            // Try next candidate
        }
    }
    return null;
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;
    const insuredName = (data?.insured?.name || data?.insuredName || 'Certificate').replace(/[^a-zA-Z0-9 ]/g, '');

    console.log('[COI Generator] Generating ACORD 25 certificate for:', insuredName);

    const scriptPath = path.join(PROJECT_ROOT, 'python_backend', 'fill_acord25.py');
    const templatePath = path.join(PROJECT_ROOT, 'Resources', 'ACORD 25 fillable.pdf');

    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: 'fill_acord25.py not found' });
    }
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: 'ACORD 25 fillable.pdf template not found in Resources/' });
    }

    const pythonExe = findPython();
    if (!pythonExe) {
      return res.status(500).json({
        error: 'Python not found. Install Python 3 and PyPDF2 to generate ACORD 25 PDFs.'
      });
    }

    // Call Python script: pipe JSON in, get PDF bytes out
    const inputJson = JSON.stringify(data);
    const pdfBytes = execFileSync(pythonExe, [scriptPath], {
      input: inputJson,
      maxBuffer: 20 * 1024 * 1024, // 20MB
      timeout: 30000,
    });

    if (!pdfBytes || pdfBytes.length < 100) {
      return res.status(500).json({ error: 'PDF generation returned empty output' });
    }

    // Return the filled PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="COI-${insuredName}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);

    console.log(`[COI Generator] Generated ${pdfBytes.length} byte ACORD 25 PDF for ${insuredName}`);

    res.status(200).send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('[COI Generator] Error:', error.message);
    if (error.stderr) {
      console.error('[COI Generator] Python stderr:', error.stderr.toString());
    }
    res.status(500).json({
      success: false,
      error: error.message,
      detail: error.stderr ? error.stderr.toString().trim() : undefined
    });
  }
}

export default securityMiddleware(handler);
