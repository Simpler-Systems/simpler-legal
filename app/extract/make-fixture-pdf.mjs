// Builds a minimal raw PDF fixture: page 1 has real text (planted PII) + /Info author;
// page 2 is intentionally empty — must trip the no-text-layer refusal rail.
import fs from 'node:fs';

const objs = [];
function obj(s) { objs.push(s); return objs.length; }

const content1 = `BT /F1 12 Tf 72 720 Td (Agreement between Hastings Holdings Ltd and Lim Wei Sheng.) Tj
0 -20 Td (Contact: +65 6438 2210 · SSN 123-45-6789 · matter M-2026-0141.) Tj ET`;
const content2 = ``; // empty page — the scan-refusal case

obj('<< /Type /Catalog /Pages 2 0 R >>');
obj('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');
obj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>');
obj(`<< /Length ${content1.length} >>\nstream\n${content1}\nendstream`);
obj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R >>');
obj(`<< /Length ${content2.length} >>\nstream\n${content2}\nendstream`);
obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
obj('<< /Author (Janet Kwon) /Creator (simpler.red fixture) /Producer (make-fixture-pdf.mjs) >>');

let out = '%PDF-1.4\n';
const offsets = [0];
objs.forEach((body, i) => {
  offsets.push(out.length);
  out += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = out.length;
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objs.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

fs.writeFileSync(new URL('./fixture.pdf', import.meta.url), out, 'latin1');
console.log(`fixture.pdf written · ${out.length} bytes · 2 pages (1 text, 1 empty)`);
