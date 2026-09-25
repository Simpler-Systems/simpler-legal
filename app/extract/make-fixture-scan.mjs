// Wraps fixture-scan.jpg (a rendered image OF text — pixels, not text) into real PDFs:
//   fixture-scan.pdf          one image-only page: exactly what a scanner produces. REFUSED.
//   fixture-scan-stamped.pdf  the same image page plus a court's e-filing stamp across the top
//                             and a Bates number at the foot, both as real text — what a
//                             filed scan looks like after CM/ECF stamps it. REFUSED (the
//                             stamped-scan rail; measured miss of 2026-09-14, OPS_LEDGER).
//   fixture-letterhead.pdf    a small logo (the same image at 120×40) over a page of real
//                             text — a letterhead. Must stay OK: the rail is about a page
//                             that IS an image, not a page that HAS one.
import fs from 'node:fs';

const jpg = fs.readFileSync(new URL('./fixture-scan.jpg', import.meta.url));

// Minimal raw PDF writer: one page, one image XObject, one Helvetica font, one content stream.
function writePdf(file, content, imageW, imageH) {
  const objs = [];
  const obj = (s) => { objs.push(s); return objs.length; };
  obj('<< /Type /Catalog /Pages 2 0 R >>');
  obj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R >>');
  obj(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push('IMAGE'); // placeholder, handled specially below
  obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let out = Buffer.from('%PDF-1.4\n', 'latin1');
  const offsets = [0];
  const append = (b) => { out = Buffer.concat([out, Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')]); };
  objs.forEach((body, i) => {
    offsets.push(out.length);
    if (body === 'IMAGE') {
      append(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageW} /Height ${imageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      append(jpg);
      append('\nendstream\nendobj\n');
    } else {
      append(`${i + 1} 0 obj\n${body}\nendobj\n`);
    }
  });
  const xref = out.length;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) tail += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  tail += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  append(tail);
  fs.writeFileSync(new URL(`./${file}`, import.meta.url), out);
  return out.length;
}

// 1. the true scan: the image fills the page, nothing else
let n = writePdf('fixture-scan.pdf', 'q 612 0 0 792 0 0 cm /Im1 Do Q', 612, 792);
console.log(`fixture-scan.pdf written · ${n} bytes · 1 page, image-only (a true "scan")`);

// 2. the stamped scan: the same page after the court's system stamped it (text in the margins only)
n = writePdf('fixture-scan-stamped.pdf',
  'q 612 0 0 792 0 0 cm /Im1 Do Q\n' +
  'BT /F1 9 Tf 118 779 Td (Case 1:26-cv-00001-ABC Document 1 Filed 01/02/26 Page 1 of 3) Tj ET\n' +
  'BT /F1 8 Tf 500 12 Td (DEF000123) Tj ET', 612, 792);
console.log(`fixture-scan-stamped.pdf written · ${n} bytes · 1 page, image + e-filing stamp + Bates number (a filed scan)`);

// 3. the letterhead control: a small logo over a page of real text
const lines = [
  'Hastings Holdings Ltd', '12 Harbour Road, Singapore 049789', '',
  'Dear Ms Tan,', '',
  'Thank you for your letter of 3 March. We confirm that the agreement between Hastings',
  'Holdings Ltd and Lim Wei Sheng remains in force and that the sums due under clause 4',
  'were paid on 28 February. Our reference for this matter is M-2026-0141; please quote it',
  'in any reply. We would be grateful for a copy of the signed schedule by Friday.', '',
  'Yours sincerely,', 'Janet Kwon',
];
let text = 'BT /F1 11 Tf 72 700 Td 14 TL\n';
for (const l of lines) text += `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*\n`;
text += 'ET';
n = writePdf('fixture-letterhead.pdf', 'q 120 0 0 40 72 730 cm /Im1 Do Q\n' + text, 612, 792);
console.log(`fixture-letterhead.pdf written · ${n} bytes · 1 page, small logo + ${lines.join(' ').split(/\s+/).filter(Boolean).length} words of text (a letterhead; must stay OK)`);
