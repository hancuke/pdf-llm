// Copies the PDFium WASM binary from the installed @embedpdf/pdfium package
// into public/ so it is served locally (no CDN) — required for the fully
// offline app (ADR-0001). Run automatically via the predev/prebuild/prepreview
// npm scripts.
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm')
const destDir = resolve(root, 'public')
const dest = resolve(destDir, 'pdfium.wasm')

await mkdir(destDir, { recursive: true })
await copyFile(src, dest)
console.log(`copied pdfium.wasm -> ${dest}`)
