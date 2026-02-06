/**
 * Certificate of Insurance (COI) Generator API
 *
 * Generates ACORD 25 certificates by overlaying text on the PDF template
 * Endpoint: /api/generate-coi
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    console.log('[COI Generator] Generating certificate for:', data.insuredName);

    // Load the ACORD 25 template
    const templatePath = path.join(process.cwd(), 'Resources', 'CERTIFICATE OF INSURANCE (202512).PDF');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

    // Get the first page
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Define text properties
    const fontSize = 9;
    const fontSizeSmall = 8;
    const textColor = rgb(0, 0, 0);

    // Field coordinates (measured from bottom-left origin)
    // Producer section (top left)
    const producerX = 40;
    const producerY = height - 95;

    firstPage.drawText(data.producerName || 'Altech Insurance Agency', {
      x: producerX,
      y: producerY,
      size: fontSize,
      font: font,
      color: textColor
    });

    firstPage.drawText('7813 NE 13th Ave', {
      x: producerX,
      y: producerY - 12,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    firstPage.drawText('Vancouver, WA 98665', {
      x: producerX,
      y: producerY - 24,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    // Contact info
    firstPage.drawText(data.contactName || '', {
      x: producerX,
      y: producerY - 40,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    firstPage.drawText(data.phone || '(360) 573-3080', {
      x: producerX + 150,
      y: producerY - 40,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    firstPage.drawText(data.email || '', {
      x: producerX + 280,
      y: producerY - 40,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    // Certificate date (top right)
    const dateX = width - 150;
    const dateY = height - 70;
    firstPage.drawText(data.certificateDate || new Date().toLocaleDateString('en-US'), {
      x: dateX,
      y: dateY,
      size: fontSize,
      font: font,
      color: textColor
    });

    // Insured section (left side)
    const insuredX = 40;
    const insuredY = height - 170;

    firstPage.drawText(data.insuredName || '', {
      x: insuredX,
      y: insuredY,
      size: fontSize,
      font: fontBold,
      color: textColor
    });

    firstPage.drawText(data.insuredAddress1 || '', {
      x: insuredX,
      y: insuredY - 12,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    firstPage.drawText(data.insuredAddress2 || '', {
      x: insuredX,
      y: insuredY - 24,
      size: fontSizeSmall,
      font: font,
      color: textColor
    });

    // Description of operations (bottom section)
    const descriptionX = 40;
    const descriptionY = 180; // From bottom

    const description = data.descriptionOfOperations || 'General Contracting';
    firstPage.drawText(description, {
      x: descriptionX,
      y: descriptionY,
      size: fontSize,
      font: font,
      color: textColor,
      maxWidth: width - 80
    });

    // Certificate Holder (bottom left)
    const holderX = 40;
    const holderY = 120;

    if (data.certificateHolder) {
      firstPage.drawText(data.certificateHolder.name || '', {
        x: holderX,
        y: holderY,
        size: fontSize,
        font: fontBold,
        color: textColor
      });

      firstPage.drawText(data.certificateHolder.address1 || '', {
        x: holderX,
        y: holderY - 12,
        size: fontSizeSmall,
        font: font,
        color: textColor
      });

      firstPage.drawText(data.certificateHolder.address2 || '', {
        x: holderX,
        y: holderY - 24,
        size: fontSizeSmall,
        font: font,
        color: textColor
      });
    }

    // Authorized Representative (bottom right)
    const sigX = width - 200;
    const sigY = 60;

    firstPage.drawText(data.authorizedRepresentative || '', {
      x: sigX,
      y: sigY,
      size: fontSize,
      font: fontBold,
      color: textColor
    });

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Return the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="COI-${data.insuredName || 'Certificate'}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);

    console.log(`[COI Generator] Generated ${pdfBytes.length} byte PDF for ${data.insuredName}`);

    res.status(200).send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('[COI Generator] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
