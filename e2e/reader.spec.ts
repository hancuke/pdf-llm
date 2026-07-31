import { test, expect } from '@playwright/test'

const FIXTURE = 'e2e/fixtures/sample.pdf'

// EmbedPDF renders each page as a bitmap <img> inside a PagePointerProvider.
// There is no DOM text layer, so selection is the engine's pointer-based text
// selection (drag / double-click over the rendered page). We therefore drive
// selection with real pointer drags at page coordinates rather than
// `getByText`, and assert on the resulting action sheet + LLM request.

test('opens a PDF and renders a page', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)

  // The page wrapper (bitmap render + selection layer) appears.
  await expect(page.locator('.pdf-page').first()).toBeVisible()
})

test('selecting text opens the action sheet and starts a conversation', async ({
  page,
}) => {
  // Configure an (unreachable) endpoint so the action isn't blocked; the
  // conversation still opens and surfaces the call error.
  await page.addInitScript(() => {
    localStorage.setItem('pdfllm.endpoint', 'http://127.0.0.1:9/v1')
    localStorage.setItem('pdfllm.apiKey', 'sk-e2e')
    localStorage.setItem('pdfllm.model', 'e2e-model')
  })

  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)
  await expect(page.locator('.pdf-page').first()).toBeVisible()
  await page.waitForTimeout(1500)

  const wrapper = page.locator('.pdf-page').first()
  const box = await wrapper.boundingBox()
  if (!box) throw new Error('page wrapper has no bounding box')

  // Drag a horizontal swipe across the first text line to select it.
  await page.mouse.move(box.x + 40, box.y + 60)
  await page.mouse.down()
  await page.mouse.move(box.x + 240, box.y + 60, { steps: 5 })
  await page.mouse.move(box.x + 440, box.y + 60, { steps: 5 })
  await page.mouse.up()

  // The iOS-style action sheet appears with the preset Quick Actions.
  const sheet = page.locator('.action-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('解释选中内容')).toBeVisible()
  await expect(sheet.getByText('翻译选中内容')).toBeVisible()

  // Picking an action starts the conversation (composer becomes available).
  await sheet.getByText('解释选中内容').click()
  await expect(page.locator('textarea.conv-input')).toBeVisible()

  // With an unreachable endpoint the failure is surfaced inside the panel.
  await expect(page.locator('.conv-error')).toBeVisible()
})

test('dragging across a line break selects both lines', async ({ page }) => {
  // Configure an (unreachable) endpoint so the action isn't blocked; we only
  // need the LLM request to be issued so we can inspect the selected text.
  await page.addInitScript(() => {
    localStorage.setItem('pdfllm.endpoint', 'http://127.0.0.1:9/v1')
    localStorage.setItem('pdfllm.apiKey', 'sk-e2e')
    localStorage.setItem('pdfllm.model', 'e2e-model')
  })

  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)
  await expect(page.locator('.pdf-page').first()).toBeVisible()
  await page.waitForTimeout(1500)

  const wrapper = page.locator('.pdf-page').first()
  const box = await wrapper.boundingBox()
  if (!box) throw new Error('page wrapper has no bounding box')

  // Diagonal drag from line 1 (contains "selection") down across the line
  // break into line 2 (contains "region").
  await page.mouse.move(box.x + 40, box.y + 70)
  await page.mouse.down()
  await page.mouse.move(box.x + 240, box.y + 95, { steps: 5 })
  await page.mouse.move(box.x + 440, box.y + 120, { steps: 5 })
  await page.mouse.up()

  const sheet = page.locator('.action-sheet')
  await expect(sheet).toBeVisible()

  // Capture the LLM request and verify the selected text spans both lines.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/chat/completions')),
    sheet.getByText('解释选中内容').click(),
  ])
  const body = JSON.parse(req.postData() || '{}')
  expect(JSON.stringify(body)).toContain('selection')
  expect(JSON.stringify(body)).toContain('region')
})
