import { expect, test } from '@playwright/test'

test('переключатель языка меняет интерфейс и сохраняется', async ({ page }) => {
  await page.goto('/')
  // По умолчанию (locale ru-RU) — русский.
  await expect(page.getByRole('button', { name: 'Настроить инструмент' })).toBeVisible()

  await page.getByRole('group', { name: 'Язык интерфейса' }).getByRole('button', { name: 'EN' }).click()
  await expect(page.getByRole('button', { name: 'Set up instrument' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Am минор' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Am minor' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  // Выбор языка переживает перезагрузку.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Set up instrument' })).toBeVisible()
})

test('английский интерфейс переводит гаммы и аккорды', async ({ browser }) => {
  // Свежий контекст с английской локалью — автоопределение выбирает EN.
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await page.goto('/?section=scales')
  await expect(page.getByRole('heading', { name: 'Fingering library' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Best/ })).toBeVisible()

  await page.getByRole('button', { name: /Chords/ }).click()
  await expect(page.getByRole('heading', { name: 'Diatonic chords' })).toBeVisible()
  await expect(page.getByText('Triads')).toBeVisible()
  await context.close()
})
