/**
 * Name Pronunciation API
 *
 * Generates phonetic pronunciation for first/last names using Gemini.
 */

import { securityMiddleware, sanitizeInput } from './_security.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
      return;
    }

    const rawFirst = sanitizeInput(req.body?.firstName || '', 80);
    const rawLast = sanitizeInput(req.body?.lastName || '', 80);
    if (!rawFirst && !rawLast) {
      res.status(400).json({ error: 'First or last name is required' });
      return;
    }

    const prompt =
      'Generate phonetic pronunciations for the provided name(s).\n' +
      'Rules:\n' +
      '- Return plain ASCII with syllable breaks using hyphens.\n' +
      '- Use uppercase for the stressed syllable.\n' +
      '- If unsure, provide a best-effort guess.\n' +
      'Return ONLY JSON with this shape:\n' +
      '{"firstNamePhonetic":"","lastNamePhonetic":""}\n' +
      `First Name: ${rawFirst}\n` +
      `Last Name: ${rawLast}`;

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
        response_mime_type: 'application/json',
        response_schema: {
          type: 'object',
          properties: {
            firstNamePhonetic: { type: 'string' },
            lastNamePhonetic: { type: 'string' }
          },
          required: ['firstNamePhonetic', 'lastNamePhonetic']
        }
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    if (!response.ok) {
      res.status(500).json({ error: data?.error?.message || 'Gemini request failed' });
      return;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      res.status(500).json({ error: 'Malformed JSON from Gemini' });
      return;
    }

    res.status(200).json({
      firstNamePhonetic: parsed.firstNamePhonetic || '',
      lastNamePhonetic: parsed.lastNamePhonetic || ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
}

export default securityMiddleware(handler);
