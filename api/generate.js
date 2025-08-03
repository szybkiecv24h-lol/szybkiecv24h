import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { name, email, position, experience } = req.body;

  try {
    // Wczytanie szablonu
    const templatePath = path.join(process.cwd(), 'templates', 'Nowoczesne.html');
    let html = await fs.readFile(templatePath, 'utf-8');

    // Podstawienie danych
    html = html.replace('{{name}}', name)
               .replace('{{email}}', email)
               .replace('{{position}}', position)
               .replace('{{experience}}', experience);

    // Generowanie PDF przez Puppeteer
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // Konfiguracja mailera
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"CV 24h" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Twoje gotowe CV',
      html: '<p>Dziękujemy za skorzystanie z CV 24h.<br>Twoje CV znajduje się w załączniku.</p>',
      attachments: [{
        filename: 'CV.pdf',
        content: pdfBuffer,
      }],
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}