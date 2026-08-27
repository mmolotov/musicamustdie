import { expect, test } from '@playwright/test'

// The needle is animated; reduced motion makes it land at once so the suite
// never races the CSS transition. `page.emulateMedia` rather than `test.use`:
// the file-level context option does not reach `matchMedia` in this setup.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('полный раунд: барабан, ноты, гамма, пентатоника и аккорд', async ({ page }) => {
  await page.goto('/?practice=1&seed=101')

  await expect(page.getByRole('heading', { name: 'Тональность не выбрана' })).toBeVisible()
  // Вкладки уступают место панели шагов, круг получает свою подпись.
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toHaveCount(0)
  await expect(page.getByText('Нажмите сектор, чтобы тренировать эту тональность')).toBeVisible()

  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  // Шаг 1 — ноты. Тональность видна, знаки при ключе спрятаны в обоих местах.
  await expect(page.getByRole('heading', { name: 'E · Ми минор' })).toBeVisible()
  await expect(page.locator('.key-signature-badge')).toContainText('скрыто')
  await expect(page.locator('.circle-center__signature')).toHaveText('скрыто')
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
  // Гриф целиком переехал на шаг гаммы — здесь только состав.
  await expect(page.locator('.fretboard-scroll')).toHaveCount(0)
  await expect(page.locator('.key-signature-badge')).toContainText('1 диез')
  await expect(page.locator('.circle-center__signature')).toHaveText('1 диез')

  // Шаг 2 — гамма: приложение само назначает аппликатуру и даёт метроном.
  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(page.getByText(/Сыграйте гамму вверх и вниз в этой аппликатуре/)).toBeVisible()
  await expect(page.locator('.practice-assignment h4')).toBeVisible()
  await expect(page.locator('.practice-assignment__head p')).toContainText('лады')
  // Ноты уже названы, так что знаки больше не прячем.
  await expect(page.locator('.key-signature-badge')).toContainText('1 диез')
  // Диаграмма и таб закрыты, пока не сыграно.
  await expect(page.locator('.practice-assignment > .fretboard-scroll')).toHaveCount(0)
  // Весь гриф здесь есть, но свёрнут — открывается только по клику.
  await expect(page.locator('.full-neck-panel .fretboard-scroll')).toBeHidden()
  await page.getByText('Все ноты на грифе', { exact: true }).click()
  await expect(page.locator('.full-neck-panel .fretboard-scroll')).toBeVisible()

  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await expect(page.locator('.practice-assignment > .fretboard-scroll')).toBeVisible()
  await expect(page.locator('.practice-assignment .tab-card')).toBeVisible()
  await page.getByRole('button', { name: 'Получилось', exact: true }).click()

  // Шаг 3 — пентатоника: ступени видны сразу, две из них погашены.
  await expect(page.getByText('Сыграйте этот бокс пентатоники: E · Ми минорная пентатоника')).toBeVisible()
  await expect(page.locator('.practice-pentatonic .note-card')).toHaveCount(7)
  await expect(page.locator('.practice-pentatonic .note-card.is-dropped strong')).toHaveText(['F♯', 'C'])
  await expect(page.getByText('Погашены F♯, C')).toBeVisible()
  await expect(page.locator('.practice-assignment h4')).toContainText('Бокс')
  // Гриф закрыт, пока не сыграно, — как и на шаге гаммы.
  await expect(page.locator('.practice-assignment > .fretboard-scroll')).toHaveCount(0)
  // Но пентатоника на всём грифе доступна по клику, как гамма на своём шаге.
  await expect(page.locator('.full-neck-panel .fretboard-scroll')).toBeHidden()
  await page.getByText('Пентатоника на всём грифе', { exact: true }).click()
  await expect(page.locator('.full-neck-panel .fretboard-scroll')).toBeVisible()
  // На грифе только пять нот пентатоники: F♯ и C сюда не попадают.
  await expect(page.locator('.full-neck-panel [aria-label*="Фа диез"]')).toHaveCount(0)
  await expect(page.locator('.full-neck-panel [aria-label*="Ми"]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await expect(page.locator('.practice-assignment > .fretboard-scroll')).toBeVisible()
  await expect(page.locator('.practice-assignment .tab-card')).toBeVisible()
  await page.getByRole('button', { name: 'Получилось', exact: true }).click()

  // Шаг 4 — аккорд на VI ступени ми минора, то есть до мажор.
  await expect(page.getByText('Какое трезвучие на VI ступени: E · Ми натуральный минор?')).toBeVisible()
  await page.getByRole('button', { name: 'До', exact: true }).click()
  await page.getByRole('button', { name: 'Мажорное' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()
  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  // Разбор не нужен — ниже раскрывается обычный вид аккордов на той же ступени.
  await expect(page.locator('.practice-answer')).toHaveCount(0)
  await expect(page.locator('.selected-chord-summary__symbol')).toHaveText('C')
  await expect(page.locator('.practice-tally dd').first()).toHaveText('4')

  // Последний шаг сразу запускает следующую тональность, и подсказки снова гаснут.
  await page.getByRole('button', { name: 'Следующая тональность' }).click()
  await expect(page.getByRole('heading', { name: 'C♯ · До♯ минор' })).toBeVisible()
  await expect(page.getByText('Раунд 2')).toBeVisible()
  await expect(page.locator('.key-signature-badge')).toContainText('скрыто')

  await page.getByRole('button', { name: 'Выйти из тренировки' }).click()
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toBeVisible()
})

test('можно вернуться к пройденному шагу и снова уйти вперёд', async ({ page }) => {
  await page.goto('/?practice=1&seed=101')
  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await page.getByRole('button', { name: 'Получилось', exact: true }).click()
  await expect(page.getByText(/Сыграйте этот бокс пентатоники/)).toBeVisible()

  // Возврат к нотам: шаг открывается сразу с ответом, оценка прежняя.
  await page.getByRole('button', { name: 'Ноты', exact: true }).click()
  await expect(page.getByText(/Соберите гамму по ступеням/)).toBeVisible()
  await expect(page.locator('.practice-verdict')).toHaveText('Пропущено')
  await expect(page.locator('.note-answer strong')).toHaveText([
    'E', 'F♯', 'G', 'A', 'B', 'C', 'D',
  ])
  // Счёт не меняется от прогулок по раунду.
  await expect(page.locator('.practice-tally dd').nth(2)).toHaveText('1')
  await expect(page.locator('.practice-tally dd').first()).toHaveText('1')

  // Шаг впереди закрыт, пока до него не дошли.
  await expect(page.getByRole('button', { name: 'Аккорд', exact: true })).toBeDisabled()

  // А дойденный, но не оценённый шаг открыт — и возвращается вопросом.
  await page.getByRole('button', { name: 'Пентатоника', exact: true }).click()
  await expect(page.getByText(/Сыграйте этот бокс пентатоники/)).toBeVisible()
  await expect(page.locator('.practice-verdict')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ноты', exact: true }).click()

  // Вперёд: гамма снова открыта с уже выставленной оценкой, без переспроса.
  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(page.getByText(/Сыграйте гамму вверх и вниз/)).toBeVisible()
  await expect(page.locator('.practice-verdict')).toHaveText('Верно')
  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(page.getByText(/Сыграйте этот бокс пентатоники/)).toBeVisible()
  await expect(page.locator('.practice-verdict')).toHaveCount(0)
  await expect(page.locator('.practice-tally dd').first()).toHaveText('1')
})

test('пропуск подсказки и разбор ошибки в аккорде', async ({ page }) => {
  await page.goto('/?practice=1&seed=1')
  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  await expect(page.getByRole('heading', { name: 'B♭ · Си♭ минор' })).toBeVisible()
  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await expect(page.locator('.practice-verdict')).toHaveText('Пропущено')
  // Раскрытие учит написанию: бемоли, а не энгармонические диезы.
  await expect(page.locator('.note-answer strong')).toHaveText([
    'B♭', 'C', 'D♭', 'E♭', 'F', 'G♭', 'A♭',
  ])

  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await page.getByRole('button', { name: 'Не получилось' }).click()

  // Пентатоника си-бемоль минора: те же бемоли, без II и VI ступеней.
  await expect(page.locator('.practice-pentatonic .note-card.is-dropped strong')).toHaveText(['C', 'G♭'])
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await page.getByRole('button', { name: 'Получилось', exact: true }).click()

  // Аккорд I ступени — си-бемоль минор; отвечаем неверно и смотрим разбор.
  await expect(page.getByText('Какое трезвучие на I ступени: B♭ · Си♭ натуральный минор?')).toBeVisible()
  await page.getByRole('button', { name: 'До', exact: true }).click()
  await page.getByRole('button', { name: 'Мажорное' }).click()
  await page.getByRole('button', { name: 'Проверить' }).click()

  await expect(page.locator('.practice-verdict')).toHaveText('Неверно')
  await expect(page.locator('.practice-answer strong')).toHaveText('i · B♭m')
  // Разбор открывает обычный вид аккордов, уже на нужной ступени.
  await expect(page.locator('.selected-chord-summary__symbol')).toHaveText('B♭m')
  await expect(page.locator('.practice-tally dd').nth(1)).toHaveText('2')
  await expect(page.locator('.practice-tally dd').nth(2)).toHaveText('1')
})

test('тренировка работает и на басу: своя библиотека аппликатур', async ({ page }) => {
  await page.goto('/?practice=1&seed=101&instrument=bass-guitar')
  await page.getByRole('button', { name: 'Крутить барабан' }).click()

  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await page.getByRole('button', { name: 'Дальше' }).click()

  await expect(page.locator('.practice-assignment h4')).toBeVisible()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  // У баса четыре струны — гриф и таб должны быть его собственными.
  await expect(page.locator('.practice-assignment > .fretboard-scroll .fretboard__string')).toHaveCount(4)
  await expect(page.locator('.practice-assignment .tab-grid__label')).toHaveCount(4)

  // Боксы пентатоники строятся и на четырёх струнах.
  await page.getByRole('button', { name: 'Получилось', exact: true }).click()
  await expect(page.locator('.practice-assignment h4')).toContainText('Бокс')
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await expect(page.locator('.practice-assignment > .fretboard-scroll .fretboard__string')).toHaveCount(4)
})

test('переход между тональностями: клик по кругу и повтор', async ({ page }) => {
  await page.goto('/?practice=1&seed=101')

  // Барабан не обязателен: тональность можно взять руками с первого же раунда.
  await page.getByRole('button', { name: 'A♭ мажор', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A♭ · Ля♭ мажор' })).toBeVisible()
  await expect(page.getByText('Раунд 1')).toBeVisible()
  await expect(page.getByText(/Соберите гамму по ступеням/)).toBeVisible()

  // Клик в середине раунда перебивает его на выбранную тональность.
  await page.getByRole('button', { name: 'Dm минор', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'D · Ре минор' })).toBeVisible()
  await expect(page.getByText('Раунд 2')).toBeVisible()

  // Проходим раунд насквозь и повторяем ту же тональность.
  await page.getByRole('button', { name: 'Не помню — показать' }).click()
  await page.getByRole('button', { name: 'Дальше' }).click()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await page.getByRole('button', { name: 'Не получилось' }).click()
  await page.getByRole('button', { name: 'Сыграл — показать' }).click()
  await page.getByRole('button', { name: 'Не получилось' }).click()
  await page.getByRole('button', { name: 'Не помню — показать' }).click()

  await page.getByRole('button', { name: 'Ещё раз эту же' }).click()
  await expect(page.getByRole('heading', { name: 'D · Ре минор' })).toBeVisible()
  await expect(page.getByText('Раунд 3')).toBeVisible()
  await expect(page.getByText(/Соберите гамму по ступеням/)).toBeVisible()
  // Счёт сессии не обнуляется повтором.
  await expect(page.locator('.practice-tally dd').nth(2)).toHaveText('2')
})
