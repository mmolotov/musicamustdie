import { expect, test } from '@playwright/test'

// The needle is animated; reduced motion makes it land at once so the suite
// never races the CSS transition. `page.emulateMedia` rather than `test.use`:
// the file-level context option does not reach `matchMedia` in this setup.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('полный раунд: барабан, знаки, ноты, гамма и аккорд', async ({ page }) => {
  await page.goto('/?practice=1&seed=101')

  await expect(page.getByRole('heading', { name: 'Тональность не выбрана' })).toBeVisible()
  // Круг перестаёт быть кликабельным, вкладки уступают место панели шагов.
  await expect(page.getByRole('button', { name: 'G мажор' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  // Шаг 1 — знаки. Тональность видна, знаки при ключе спрятаны.
  await expect(page.getByRole('heading', { name: 'E · Ми минор' })).toBeVisible()
  await expect(page.locator('.key-signature-badge')).toContainText('скрыто')
  await expect(page.getByText('Сколько знаков при ключе: E · Ми натуральный минор?')).toBeVisible()

  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '♯ диезы' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()
  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  await expect(page.locator('.key-signature-badge')).toContainText('1 диез')

  // Шаг 2 — ноты.
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

  // Шаг 3 — гамма: приложение само назначает аппликатуру и даёт метроном.
  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(page.getByText(/Сыграйте гамму вверх и вниз в этой аппликатуре/)).toBeVisible()
  await expect(page.locator('.practice-assignment h4')).toBeVisible()
  await expect(page.locator('.practice-assignment__head p')).toContainText('лады')
  await expect(page.getByRole('button', { name: /Метроном/ })).toBeVisible()
  // Диаграмма и таб закрыты, пока не сыграно.
  await expect(page.locator('.fretboard-scroll')).toHaveCount(0)

  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await expect(page.locator('.practice-assignment .fretboard-scroll')).toBeVisible()
  await expect(page.locator('.practice-assignment .tab-card')).toBeVisible()
  await page.getByRole('button', { name: 'Получилось', exact: true }).click()

  // Шаг 4 — аккорд на VI ступени ми минора, то есть до мажор.
  await expect(page.getByText('Какое трезвучие на VI ступени: E · Ми натуральный минор?')).toBeVisible()
  await page.getByRole('button', { name: 'До', exact: true }).click()
  await page.getByRole('button', { name: 'Мажорное' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()
  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  // Разбор не нужен — ниже раскрывается обычный вид аккордов на той же ступени.
  await expect(page.locator('.signature-answer')).toHaveCount(0)
  await expect(page.locator('.selected-chord-summary__symbol')).toHaveText('C')
  await expect(page.locator('.practice-tally dd').first()).toHaveText('4')

  // Последний шаг сразу запускает следующую тональность.
  await page.getByRole('button', { name: 'Следующая тональность' }).click()
  await expect(page.getByRole('heading', { name: 'B♭ · Си♭ минор' })).toBeVisible()
  await expect(page.getByText('Раунд 2')).toBeVisible()

  await page.getByRole('button', { name: 'Выйти из тренировки' }).click()
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toBeVisible()
})

test('энгармония, пропуск подсказки и разбор ошибки в аккорде', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await page.getByRole('button', { name: 'Не получилось' }).click()

  // Аккорд I ступени — си-бемоль минор; отвечаем неверно и смотрим разбор.
  await expect(page.getByText('Какое трезвучие на I ступени: B♭ · Си♭ натуральный минор?')).toBeVisible()
  await page.getByRole('button', { name: 'До', exact: true }).click()
  await page.getByRole('button', { name: 'Мажорное' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()

  await expect(page.locator('.practice-verdict')).toHaveText('Неверно')
  await expect(page.locator('.signature-answer strong')).toHaveText('i · B♭m')
  // Разбор открывает обычный вид аккордов, уже на нужной ступени.
  await expect(page.locator('.selected-chord-summary__symbol')).toHaveText('B♭m')
  await expect(page.locator('.practice-tally dd').nth(1)).toHaveText('2')
  await expect(page.locator('.practice-tally dd').nth(2)).toHaveText('1')
})

test('тренировка работает и на басу: своя библиотека аппликатур', async ({ page }) => {
  await page.goto('/?practice=1&seed=101&instrument=bass-guitar')
  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  // Проскакиваем к шагу гаммы, подсказки не проверяем.
  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await page.getByRole('button', { name: 'Дальше' }).click()

  await expect(page.locator('.practice-assignment h4')).toBeVisible()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  // У баса четыре струны — гриф и таб должны быть его собственными.
  await expect(page.locator('.practice-assignment .fretboard__string')).toHaveCount(4)
  await expect(page.locator('.practice-assignment .tab-grid__label')).toHaveCount(4)
})
