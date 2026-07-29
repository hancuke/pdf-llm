// Copies pdf.js static assets (standard fonts + CMaps) into ./public so they
// are served locally and the app stays fully offline (ADR-0001). Runs
// automatically before dev/build/preview via the npm "pre*" scripts.
//
// These copies are derived from the pinned pdfjs-dist dependency and are
// git-ignored; they are regenerated on install / build.

import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pdfjs = resolve(root, 'node_modules/pdfjs-dist')

async function copyDir(name) {
  const src = resolve(pdfjs, name)
  const dest = resolve(root, 'public', name)
  if (!existsSync(src)) {
    console.warn(`pdf.js asset missing: ${src}`)
    return
  }
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log(`Copied pdf.js ${name} -> public/${name}`)
}

await copyDir('standard_fonts')
await copyDir('cmaps')
