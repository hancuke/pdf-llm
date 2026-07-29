// Generates a tiny, valid PDF fixture used by the browser E2E tests.
// Run once with: node scripts/generate-fixtures.mjs
// The output is committed so the E2E suite needs no network at test time.

import { writeFileSync, mkdirSync } from 'node:fs'

const objects = {}
function obj(num, body) {
  objects[num] = body
}

obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
obj(
  3,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 820] ' +
    '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
)

// Multiple lines so the drag-selection test can cross a line boundary. The word
// "selection" sits at the end of line 1 and "region" starts line 2, so a
// rectangle spanning the line break must gather both.
const line = (y, text) => `BT /F1 18 Tf 40 ${y} Td (${text}) Tj ET`
const content = [
  line(740, 'The quick brown fox jumps over the lazy dog selection'),
  line(700, 'region based text gathering works across line ends now'),
  line(660, 'double click still selects a single word as before'),
].join('\n')
obj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

let pdf = '%PDF-1.4\n'
const offsets = []
for (let i = 1; i <= 5; i++) {
  offsets[i] = Buffer.byteLength(pdf, 'latin1')
  pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
}

const xrefStart = Buffer.byteLength(pdf, 'latin1')
pdf += 'xref\n0 6\n'
pdf += '0000000000 65535 f \n'
for (let i = 1; i <= 5; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
}
pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

mkdirSync('e2e/fixtures', { recursive: true })
writeFileSync('e2e/fixtures/sample.pdf', pdf, 'latin1')
console.log('Wrote e2e/fixtures/sample.pdf')
