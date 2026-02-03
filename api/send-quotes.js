import { createTransport } from 'nodemailer';
import sgTransport from 'nodemailer-sendgrid-transport';

/**
 * Vercel serverless function to send exported quotes via email
 * 
 * Request body:
 * {
 *   base64Zip: string (base64-encoded ZIP file),
 *   zipName: string (filename, e.g., "Quotes_2025-02-03.zip"),
 *   agentEmail: string (recipient, e.g., "austin@altechinsurance.com"),
 *   senderEmail: string (reply-to, e.g., "john@domain.com"),
 *   senderName: string (for context)
 * }
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Zip, zipName, agentEmail, senderEmail, senderName } = req.body;

    // Validate required fields
    if (!base64Zip || !zipName || !agentEmail) {
      return res.status(400).json({ 
        error: 'Missing required fields: base64Zip, zipName, agentEmail' 
      });
    }

    // Validate SendGrid API key
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'SendGrid API key not configured' 
      });
    }

    // Create nodemailer transport using SendGrid
    const transporter = createTransport(
      sgTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          api_user: 'apikey',
          api_key: apiKey,
        },
      })
    );

    // Decode base64 ZIP to buffer
    const zipBuffer = Buffer.from(base64Zip, 'base64');

    // Prepare email
    const mailOptions = {
      from: 'noreply@altechinsurance.com', // or use env var
      to: agentEmail,
      subject: `Insurance Quotes - ${senderName ? `from ${senderName}` : 'Batch Export'}`,
      html: `
        <h2>Quote Export</h2>
        <p>Hello,</p>
        <p>Attached is a batch of insurance quotes ready for processing.</p>
        ${senderEmail ? `<p><strong>Sender:</strong> ${senderName || senderEmail}</p>` : ''}
        <p>File: <code>${zipName}</code></p>
        <p>---<br/>Altech Insurance Lead Capture</p>
      `,
      attachments: [
        {
          filename: zipName,
          content: zipBuffer,
          contentType: 'application/zip',
        },
      ],
      replyTo: senderEmail || undefined,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({ 
      success: true, 
      messageId: info.messageId,
      message: `Email sent to ${agentEmail}`,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to send email' 
    });
  }
}
