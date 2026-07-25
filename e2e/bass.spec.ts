import { expect, test } from '@playwright/test'

test('можно выбрать бас-гитару: 4 струны и своя библиотека аппликатур', async ({ page }) => {
  await page.goto('/?section=notes')

  // Инструмент по умолчанию — гитара (6 струн).
  await expect(page.getByText('6 струн', { exact: true })).toBeVisible()

  // Переключаемся на бас сегментированным переключателем инструмента.
  await page.getByRole('button', { name: 'Бас-гитара', exact: true }).click()
  await expect(page).toHaveURL(/instrument=bass-guitar/)
  await expect(page.getByText('4 струн', { exact: true })).toBeVisible()
  // CAGED недоступен на 4-струнном басе (нужен стандартный шестиструнный блок).
  await expect(page.getByText('CAGED недоступен', { exact: true })).toBeVisible()

  // Гриф во вкладке «Ноты» показывает ровно четыре струны (индексы 0–3).
  await expect(page.locator('.fret-note[data-string-index="4"]')).toHaveCount(0)
  await expect(page.locator('.fret-note[data-string-index="3"]').first()).toBeVisible()

  // Библиотека аппликатур строится под бас.
  await page.getByRole('button', { name: /Гамма и TAB/ }).click()
  await expect(page.getByRole('heading', { name: 'Библиотека аппликатур' })).toBeVisible()
  await expect(page.locator('.pattern-chip').first()).toBeVisible()
})

test('гитара и бас хранят настройки независимо', async ({ page }) => {
  await page.goto('/?instrument=bass-guitar&section=notes')
  await expect(page.getByText('4 струн', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Гитара', exact: true }).click()
  await expect(page.getByText('6 струн', { exact: true })).toBeVisible()
})
