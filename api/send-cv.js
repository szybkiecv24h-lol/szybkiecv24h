module.exports = async (req, res) => {
if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const nodemailer = require('nodemailer');

    // --- Color helpers (scoped within handler to access pdf-lib rgb) ---
    function hexToRgb(hex) {
      try {
        let h = String(hex || '').trim();
        if (h.startsWith('#')) h = h.slice(1);
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return rgb(0.17,0.48,0.90); // fallback brand blue
        const num = parseInt(h, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return rgb(r/255, g/255, b/255);
      } catch (e) {
        return rgb(0.17,0.48,0.90);
      }
    }
    function hexToRgbArr(hex){
      try {
        let h = String(hex || '').trim();
        if (h.startsWith('#')) h = h.slice(1);
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0.17,0.48,0.90];
        const num = parseInt(h, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return [r/255, g/255, b/255];
      } catch(e){
        return [0.17,0.48,0.90];
      }
    }
    function lerpRgb(a, b, t){
      const r = a[0] + (b[0]-a[0])*t;
      const g = a[1] + (b[1]-a[1])*t;
      const b2 = a[2] + (b[2]-a[2])*t;
      return rgb(r, g, b2);
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      name = '',
      email = '',
      phone = '',
      position = '',
      experience = '',
      education = '',
      skills = '',
      languages = '',
      extra_info = '',
      style = 'nowoczesne'
    } = body;

    // --- Helpers ---
    function asciiFallback(str) {
      if (!str) return '';
      const map = {'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z','Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z'};
      return String(str).replace(/[\u0104\u0105\u0106\u0107\u0118\u0119\u0141\u0142\u0143\u0144\u00D3\u00F3\u015A\u015B\u0179\u017A\u017B\u017C]/g, ch => map[ch] || ch);
    }
    const A4 = { w: 595.28, h: 841.89 };
    function wrap(f, t, w, s=11) {
      t = asciiFallback(t);
      const words = t.split(/\s+/);
      const lines = [];
      let line = '';
      for (const w0 of words) {
        const test = line ? (line + ' ' + w0) : w0;
        if (f.widthOfTextAtSize(test, s) > w) { if (line) lines.push(line); line = w0; } else { line = test; }
      }
      if (line) lines.push(line);
      return lines;
    }
    function para(page, f, t, x, y, w, s=11, lineH=14, color=rgb(0.13,0.13,0.13)) {
      let yy = y;
      for (const ln of wrap(f, t, w, s)) {
        page.drawText(ln, { x, y: yy, size: s, font: f, color });
        yy -= lineH;
      }
      return yy;
    }
    function list(page, f, t, x, y, w) {
      let yy = y;
      const items = String(t||'').split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
      for (const it of items) {
        page.drawText('•', { x, y: yy, size: Math.round(11*scale), font: f });
        yy = para(page, f, it, x+12, yy, w-12, 11, 14) - 2;
      }
      return yy;
    }

    // --- PDF init ---
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([A4.w, A4.h]);
    const font = await pdf.embedStandardFont(StandardFonts.Helvetica);
    const bold = await pdf.embedStandardFont(StandardFonts.HelveticaBold);

    // palette
    const primary = rgb(0.17,0.48,0.90);
    const dark = rgb(0.13,0.13,0.13);
    const subtle = rgb(0.56,0.62,0.66);
    const lineColor = rgb(0.89,0.95,0.99);

    const margin = 40;

    // user accent & font size
    const gradStartHex = (body && body.gradStart) || null;
const gradEndHex = (body && body.gradEnd) || null;
const accent = hexToRgb((gradStartHex) || (body && body.accent) || '#2c7be5');
const fontSizeChoice = ((body && body.fontSize) || 'standard').toLowerCase();
    const scale = fontSizeChoice === 'small' ? 0.9 : fontSizeChoice === 'large' ? 1.12 : 1.0;

    // --- Styles ---
    const st = String(style || '').toLowerCase();

    if (st === 'klasyczne') {
      // Classic: top name, single column, clean separators
      const nameSize = 24;
      page.drawText(asciiFallback(name || 'Imie i nazwisko'), { x: margin, y: A4.h - margin - 10, size: nameSize, font: bold, color: dark });
      if (position) page.drawText(asciiFallback(position), { x: margin, y: A4.h - margin - 36, size: Math.round(12*scale), font, color: subtle });

      // contact line
      let y = A4.h - margin - 60;
      const contact = [email && `Email: ${email}`, phone && `Telefon: ${phone}`].filter(Boolean).join('   •   ');
      page.drawText(asciiFallback(contact), { x: margin, y, size: Math.round(10*scale), font, color: subtle });
      y -= 8;
      page.drawLine({ start:{x: margin, y}, end:{x: A4.w - margin, y}, thickness: 1, color: lineColor });
      y -= 16;

      // sections
      function header(label) {
        page.drawText(asciiFallback(label.toUpperCase()), { x: margin, y, size: Math.round(11*scale), font: bold, color: dark });
        y -= 12;
        page.drawLine({ start:{x: margin, y}, end:{x: A4.w - margin, y}, thickness: .8, color: lineColor });
        y -= 12;
      }

      if (extra_info) { header('Podsumowanie'); y = para(page, font, extra_info, margin, y, A4.w - 2*margin); y -= 10; }
      header('Doswiadczenie'); y = list(page, font, experience, margin, y, A4.w - 2*margin);
      y -= 6;
      header('Wyksztalcenie'); y = para(page, font, education, margin, y, A4.w - 2*margin);
      y -= 6;
      header('Umiejetnosci'); y = list(page, font, skills, margin, y, A4.w - 2*margin);
      y -= 6;
      header('Jezyki'); y = para(page, font, languages, margin, y, A4.w - 2*margin);

    } else if (st === 'techniczne') {
      // Technical: monospace-like feel with boxes and grid
      const mono = bold; // use bold as pseudo-mono fallback
      // header bar
      page.drawRectangle({ x: 0, y: A4.h - 80, width: A4.w, height: 80, color: rgb(0.1,0.1,0.1) });
      page.drawText(asciiFallback(name || 'Imie i nazwisko'), { x: margin, y: A4.h - 46, size: 22, font: mono, color: rgb(1,1,1) });
      if (position) page.drawText(asciiFallback(position), { x: margin, y: A4.h - 68, size: Math.round(12*scale), font, color: rgb(0.8,0.8,0.8) });

      // two equal columns
      const colW = (A4.w - margin*2 - 20) / 2;
      let yL = A4.h - 100, yR = A4.h - 100;
      function box(x, y, w, h) { page.drawRectangle({ x, y: y-h, width: w, height: h, borderWidth: 1, borderColor: lineColor, color: rgb(1,1,1) }); }
      function tHeader(x, y, label) { page.drawText(asciiFallback(label), { x, y, size: Math.round(11*scale), font: mono, color: accent }); return y - 14; }

      // Left column
      let xL = margin, xR = margin + colW + 20;

      // Contact box
      let y = yL; y = tHeader(xL, y, 'KONTAKT');
      y = para(page, font, [email, phone].filter(Boolean).join('  •  '), xL, y, colW); y -= 8;
      page.drawLine({ start:{x: xL, y}, end:{x: xL+colW, y}, thickness: 1, color: lineColor }); y -= 10;
      y = tHeader(xL, y, 'UMIEJETNOSCI');
      y = list(page, font, skills, xL, y, colW);
      yL = y - 6;

      // Right column
      y = yR; y = tHeader(xR, y, 'DOSWIADCZENIE'); y = list(page, font, experience, xR, y, colW);
      y -= 6; page.drawLine({ start:{x: xR, y}, end:{x: xR+colW, y}, thickness: 1, color: lineColor }); y -= 10;
      y = tHeader(xR, y, 'WYKSZTALCENIE'); y = para(page, font, education, xR, y, colW);
      y -= 6; page.drawLine({ start:{x: xR, y}, end:{x: xR+colW, y}, thickness: 1, color: lineColor }); y -= 10;
      y = tHeader(xR, y, 'JEZYKI'); y = para(page, font, languages, xR, y, colW);
      yR = y;

    } else {
      // Nowoczesne : left sidebar + right content + top stripe
      const headerH = 90;
      {
        const _gs = gradStartHex ? hexToRgbArr(gradStartHex) : null;
        const _ge = gradEndHex ? hexToRgbArr(gradEndHex) : null;
        if (_gs && _ge){
          const steps = 120;
          for (let i = 0; i < steps; i++){
            const t = i / (steps - 1);
            const c = lerpRgb(_gs, _ge, t);
            const x = (A4.w / steps) * i;
            const w = (A4.w / steps) + 0.5;
            page.drawRectangle({ x, y: A4.h - headerH, width: w, height: headerH, color: c });
          }
        } else {
          page.drawRectangle({ x: 0, y: A4.h - headerH, width: A4.w, height: headerH, color: accent });
        }
      }

      page.drawText(asciiFallback(name || 'Imie i nazwisko'), { x: margin, y: A4.h - 48, size: Math.round(26*scale), font: bold, color: rgb(1,1,1) });
      if (position) page.drawText(asciiFallback(position), { x: margin, y: A4.h - 68, size: Math.round(12*scale), font, color: rgb(0.9,0.95,1) });

      const leftW = 185;
      page.drawRectangle({ x: margin, y: margin, width: leftW, height: A4.h - headerH - margin*1.2, color: rgb(0.94,0.97,1) });
      let yL = A4.h - headerH - 20;
      const xL = margin + 14;
      function secL(label){ page.drawText(asciiFallback(label.toUpperCase()), { x:xL, y:yL, size:10, font: bold, color: accent }); yL -= 12; page.drawLine({ start:{x:xL, y:yL}, end:{x:xL+leftW-28, y:yL}, thickness: 1, color: lineColor }); yL-=10; }

      secL('Kontakt');
      if (email){ page.drawText('Email', { x:xL, y:yL, size:9, font:bold, color:subtle }); yL-=12; yL = para(page, font, email, xL, yL, leftW-28, 11, 14); yL-=6; }
      if (phone){ page.drawText('Telefon', { x:xL, y:yL, size:9, font:bold, color:subtle }); yL-=12; yL = para(page, font, phone, xL, yL, leftW-28, 11, 14); yL-=6; }

      secL('Umiejetnosci');
      yL = list(page, font, skills, xL, yL, leftW-28);

      const rightX = margin + leftW + 24;
      const rightW = A4.w - rightX - margin;
      let yR = A4.h - headerH - 20;
      function secR(label){ page.drawText(asciiFallback(label.toUpperCase()), { x:rightX, y:yR, size:11, font: bold, color: accent }); yR -= 12; page.drawLine({ start:{x:rightX, y:yR}, end:{x:rightX+rightW, y:yR}, thickness: 1, color: lineColor }); yR-=10; }

      if (extra_info){ secR('Podsumowanie'); yR = para(page, font, extra_info, rightX, yR, rightW, 11, 14); yR-=6; }
      secR('Doswiadczenie'); yR = list(page, font, experience, rightX, yR, rightW);
      yR-=6; secR('Wyksztalcenie'); yR = para(page, font, education, rightX, yR, rightW, 11, 14);
      yR-=6; secR('Jezyki'); yR = para(page, font, languages, rightX, yR, rightW, 11, 14);
    }

    // Footer RODO
    const rodo = asciiFallback('Wyrazam zgode na przetwarzanie moich danych osobowych przez [nazwa firmy] w celu prowadzenia rekrutacji na aplikowane przeze mnie stanowisko.');
    page.drawLine({ start:{x: margin, y: margin + 28}, end:{x: A4.w - margin, y: margin + 28}, thickness: 1, color: lineColor });
    page.drawText(rodo, { x: margin, y: margin + 14, size: Math.round(9*scale), font, color: subtle });

    const pdfBytes = await pdf.save();

    // SMTP
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO_OVERRIDE } = process.env;
    if (!SMTP_HOST) return res.status(400).json({ error: 'Brak SMTP_HOST w konfiguracji projektu na Vercel.' });
    if (!SMTP_PORT) return res.status(400).json({ error: 'Brak SMTP_PORT w konfiguracji projektu na Vercel.' });
    if (!SMTP_USER) return res.status(400).json({ error: 'Brak SMTP_USER w konfiguracji projektu na Vercel.' });
    if (!SMTP_PASS) return res.status(400).json({ error: 'Brak SMTP_PASS w konfiguracji projektu na Vercel.' });

    const toEmail = (MAIL_TO_OVERRIDE && MAIL_TO_OVERRIDE.trim()) || email;
    if (!toEmail) return res.status(400).json({ error: 'Brakuje adresu e-mail w formularzu.' });

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    const subj = asciiFallback(`Twoje gotowe CV — ${st === 'klasyczne' ? 'Klasyczne' : st === 'techniczne' ? 'Techniczne' : 'Nowoczesne'}`);
    const html = `<p>${asciiFallback('W załączniku Twoje CV wygenerowane na podstawie formularza.')}</p>`;

    await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to: toEmail,
      subject: subj,
      html,
      attachments: [{ filename: 'CV.pdf', content: Buffer.from(pdfBytes) }]
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-cv error:', err);
    return res.status(500).json({ error: 'Server error', details: (err && (err.stack || err.message)) || String(err) });
  }
};
