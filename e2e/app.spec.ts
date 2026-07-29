import { test, expect } from '@playwright/test'

test('shows the empty state on first load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('打开一个本地 PDF 开始阅读')).toBeVisible()
})

test('settings persist endpoint, key, model and custom actions across reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '设置', exact: true }).click()

  await page.getByLabel('端点 Base URL').fill('https://example.com/v1')
  await page.getByLabel('API 密钥').fill('sk-e2e')
  await page.getByLabel('模型').fill('e2e-model')

  // Add a custom action.
  await page.getByPlaceholder('动作名称，如「像给小孩解释」').fill('ELI5')
  await page
    .getByPlaceholder('提示词模板，可用 {{context}} 与 {{selection}} 占位符')
    .fill('用五岁小孩能懂的话解释：{{selection}}')
  await page.getByRole('button', { name: '添加' }).click()
  await expect(page.getByText('ELI5')).toBeVisible()

  // Reload and confirm persistence (localStorage).
  await page.reload()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByLabel('端点 Base URL')).toHaveValue('https://example.com/v1')
  await expect(page.getByLabel('API 密钥')).toHaveValue('sk-e2e')
  await expect(page.getByLabel('模型')).toHaveValue('e2e-model')
  await expect(page.getByText('ELI5')).toBeVisible()
})
