// Markdown + math rendering for LLM answers (Phase 3, story 37). Pure and
// framework-independent. Uses `marked` for Markdown and `katex` for math.
//
// Code spans/blocks are protected FIRST so that `$` or `_` inside code is never
// treated as math. Math is then extracted, rendered to HTML, and swapped back in
// via placeholders so `marked` never mangles the LaTeX. The two placeholder
// types are restored after Markdown parsing (math first, then code).

import { marked } from 'marked'
import katex from 'katex'

marked.setOptions({ gfm: true, breaks: false })

const FENCED_CODE = /```([\s\S]+?)```/g
const INLINE_CODE = /`([^`]+)`/g
const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g
const INLINE_MATH = /\$([^$]+?)\$/g

const MATH_PLACEHOLDER = /@@KATEX(\d+)@@/g
const CODE_PLACEHOLDER = /@@CODE(\d+)@@/g

function renderMath(expression: string, inline: boolean): string {
  try {
    return katex.renderToString(expression.trim(), {
      displayMode: !inline,
      throwOnError: false,
    })
  } catch {
    // Defensive: katex with throwOnError:false shouldn't throw, but if it does,
    // surface the raw expression rather than crashing the render.
    return inline ? `<code>${expression}</code>` : `<pre>${expression}</pre>`
  }
}

/**
 * Render an LLM answer (Markdown + `$inline$` / `$$block$$` math) to HTML for
 * `v-html`. The source is the user's own LLM output; we do not sanitize beyond
 * KaTeX's escaping, so a malicious/compromised endpoint could inject HTML.
 * Acceptable for a local single-user tool, but callers should be aware.
 */
export function renderMarkdown(source: string): string {
  const codeSlots: string[] = []
  const mathSlots: string[] = []

  const stashCode = (html: string): string => {
    const token = `@@CODE${codeSlots.length}@@`
    codeSlots.push(html)
    return token
  }
  const stashMath = (html: string): string => {
    const token = `@@KATEX${mathSlots.length}@@`
    mathSlots.push(html)
    return token
  }

  // 1. Protect code so math extraction below ignores `$`/`_` inside it.
  let working = source.replace(FENCED_CODE, (_m, code) => stashCode(`<pre><code>${code}</code></pre>`))
  working = working.replace(INLINE_CODE, (_m, code) => stashCode(`<code>${code}</code>`))

  // 2. Extract and render math.
  working = working.replace(BLOCK_MATH, (_m, expr) => stashMath(renderMath(expr, false)))
  working = working.replace(INLINE_MATH, (_m, expr) => stashMath(renderMath(expr, true)))

  // 3. Markdown, then restore math and code.
  const html = marked.parse(working) as string
  const withMath = html.replace(MATH_PLACEHOLDER, (_m, i) => mathSlots[Number(i)] ?? '')
  return withMath.replace(CODE_PLACEHOLDER, (_m, i) => codeSlots[Number(i)] ?? '')
}
