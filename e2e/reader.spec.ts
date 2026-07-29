import { test, expect } from '@playwright/test'

const FIXTURE = 'e2e/fixtures/sample.pdf'

test('opens a PDF and renders a selectable text layer', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)

  // A page wrapper and the extractable text from the fixture both appear.
  await expect(page.locator('.pdf-page').first()).toBeVisible()
  await expect(page.locator('.pdf-text-layer').first()).toBeVisible()
  await expect(page.getByText('selection')).toBeVisible()
})

test('selecting text opens the action sheet and starts a conversation', async ({
  page,
}) => {
  // Pre-configure a (deliberately unreachable) endpoint so the action is not
  // blocked, yet the conversation still opens and surfaces the call error.
  await page.addInitScript(() => {
    localStorage.setItem('pdfllm.endpoint', 'http://127.0.0.1:9/v1')
    localStorage.setItem('pdfllm.apiKey', 'sk-e2e')
    localStorage.setItem('pdfllm.model', 'e2e-model')
  })

  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)
  await expect(page.locator('.pdf-text-layer').first()).toBeVisible()

  // Double-click a word in the text layer to create a selection.
  const word = page.locator('.pdf-text-layer').first().getByText('selection')
  await word.dblclick()

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

test('dragging a rectangle across a line break selects both lines', async ({
  page,
}) => {
  // Configure an (unreachable) endpoint so the action isn't blocked; we only
  // need the LLM request to be issued so we can inspect the selected text.
  await page.addInitScript(() => {
    localStorage.setItem('pdfllm.endpoint', 'http://127.0.0.1:9/v1')
    localStorage.setItem('pdfllm.apiKey', 'sk-e2e')
    localStorage.setItem('pdfllm.model', 'e2e-model')
  })

  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)
  await expect(page.locator('.pdf-text-layer').first()).toBeVisible()

  // Bring the text into view so both lines are within the viewport before we
  // drag (the rendered page is taller than the viewport).
  await page.locator('.pdf-text-layer').first().scrollIntoViewIfNeeded()

  const wrapper = page.locator('.pdf-page').first()
  const box = await wrapper.boundingBox()
  if (!box) throw new Error('page wrapper has no bounding box')

  // Drag a rectangle spanning the full text width from the line-1 word
  // "selection" down to the line-2 word "region" — crossing the line break.
  const selBox = await wrapper.getByText('selection').first().boundingBox()
  const regBox = await wrapper.getByText('region').first().boundingBox()
  if (!selBox || !regBox) throw new Error('expected words not found')
  const left = box.x + 20
  const right = box.x + box.width - 20
  const y1 = selBox.y + selBox.height / 2
  const y2 = regBox.y + regBox.height / 2
  await page.mouse.move(left, y1)
  await page.mouse.down()
  await page.mouse.move((left + right) / 2, (y1 + y2) / 2, { steps: 5 })
  await page.mouse.move(right, y2, { steps: 5 })
  await page.mouse.up()

  // The action sheet appears and highlights are drawn (geometric selection).
  const sheet = page.locator('.action-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.locator('.pdf-highlight').first()).toBeVisible()

  // Capture the LLM request and verify the selected text spans both lines.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/chat/completions')),
    sheet.getByText('解释选中内容').click(),
  ])
  const body = JSON.parse(req.postData() || '{}')
  expect(JSON.stringify(body)).toContain('selection')
  expect(JSON.stringify(body)).toContain('region')
})
