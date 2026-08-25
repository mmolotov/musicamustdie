import { expect, test } from '@playwright/test'

// The needle is animated; reduced motion makes it land at once so the suite
// never races the CSS transition. `page.emulateMedia` rather than `test.use`:
// the file-level context option does not reach `matchMedia` in this setup.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('раунд тренировки: барабан, знаки, ноты и возврат в обычный режим', async ({ page }) => {
  await page.goto('/?practice=1&seed=101')

  await expect(page.getByRole('heading', { name: 'Тональность не выбрана' })).toBeVisible()
  // Круг перестаёт быть кликабельным, вкладки уступают место панели шагов.
  await expect(page.getByRole('button', { name: 'G мажор' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  // Раунд 1 — Ми минор: тональность видна, знаки при ключе спрятаны.
  await expect(page.getByRole('heading', { name: 'E · Ми минор' })).toBeVisible()
  await expect(page.locator('.key-signature-badge')).toContainText('скрыто')
  await expect(page.getByText('Сколько знаков при ключе: E · Ми натуральный минор?')).toBeVisible()

  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '♯ диезы' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()
  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  await expect(page.locator('.key-signature-badge')).toContainText('1 диез')

  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(page.getByText('Соберите гамму по ступеням: E · Ми натуральный минор')).toBeVisible()
  await expect(page.getByText('Введено 0 из 7')).toBeVisible()

  for (const note of ['Ми', 'Фа диез или Соль бемоль', 'Соль', 'Ля', 'Си', 'До', 'Ре']) {
    await page.getByRole('button', { name: note, exact: true }).click()
  }
  await expect(page.getByText('Введено 7 из 7')).toBeVisible()
  await page.getByRole('button', { name: 'Проверить' }).click()

  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  // Верный ответ не нуждается в разборе — ниже и так разворачивается обычный вид.
  await expect(page.locator('.note-answer')).toHaveCount(0)
  // Гриф — часть ответа, поэтому появляется только после проверки.
  await expect(page.getByRole('heading', { name: 'Семь ступеней' })).toBeVisible()
  await expect(page.locator('.practice-tally dd').first()).toHaveText('2')

  await page.getByRole('button', { name: 'Выйти из тренировки' }).click()
  await expect(page.getByRole('heading', { name: 'E · Ми минор' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toBeVisible()
  await expect(page.locator('.key-signature-badge')).toContainText('1 диез')
})

test('энгармоническая тональность засчитывает оба ответа, подсказку можно открыть', async ({ page }) => {
  await page.goto('/?practice=1&seed=1')
  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  // Си-бемоль минор он же Ля-диез минор: 5 бемолей и 7 диезов одинаково верны.
  await expect(page.getByRole('heading', { name: 'B♭ · Си♭ минор' })).toBeVisible()
  await page.getByRole('button', { name: '7', exact: true }).click()
  await page.getByRole('button', { name: '♯ диезы' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()

  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  await expect(page.getByText('Также верно: 7 диезов')).toBeVisible()

  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await expect(page.locator('.practice-verdict')).toHaveText('Пропущено')
  await expect(page.locator('.note-answer strong')).toHaveText([
    'B♭', 'C', 'D♭', 'E♭', 'F', 'G♭', 'A♭',
  ])
  await expect(page.locator('.practice-tally dd').nth(2)).toHaveText('1')

  // Последний шаг сразу запускает следующую тональность.
  await page.getByRole('button', { name: 'Следующая тональность' }).click()
  await expect(page.getByRole('heading', { name: 'C · До мажор' })).toBeVisible()
  await expect(page.getByText('Раунд 2')).toBeVisible()
})
