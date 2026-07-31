import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    const html = renderMarkdown('# Title\n\nA paragraph.')
    expect(html).toContain('<h1>')
    expect(html).toContain('A paragraph.')
  })

  it('renders inline code and lists', () => {
    const html = renderMarkdown('- one\n- two\n\nuse `code` here')
    expect(html).toContain('<ul>')
    expect(html).toContain('<code>code</code>')
  })

  it('renders inline math with KaTeX', () => {
    const html = renderMarkdown('The formula $E = mc^2$ is famous.')
    expect(html).toContain('katex')
    expect(html).toContain('E = mc')
  })

  it('renders block math with KaTeX', () => {
    const html = renderMarkdown('$$\\int_0^1 x\\,dx$$')
    expect(html).toContain('katex')
  })

  it('does not mangle math inside Markdown', () => {
    const html = renderMarkdown('See $a^2 + b^2 = c^2$ and **bold** text.')
    expect(html).toContain('katex')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('does not render $ inside inline code as math', () => {
    const html = renderMarkdown('run `export COST=$5 per item` in shell')
    expect(html).not.toContain('katex')
    expect(html).toContain('<code>export COST=$5 per item</code>')
  })

  it('does not render $ inside fenced code blocks as math', () => {
    const html = renderMarkdown('```\nprice = $3 + $4\n```')
    expect(html).not.toContain('katex')
    expect(html).toContain('price = $3 + $4')
  })
})
