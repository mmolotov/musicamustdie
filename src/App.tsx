import { useMemo, useState } from 'react'
import { CircleOfFifths } from './components/CircleOfFifths'
import { getInstrument, listInstruments } from './instruments/registry'
import { getInstrumentUi } from './instruments/uiRegistry'
import type { MinorVariant } from './music/types'
import {
  buildScale,
  getKeySignature,
  getRelativeMajorPitch,
  harmonizeScale,
  keyDisplayName,
  notesForDirection,
} from './music/theory'
import { useUrlState, type DetailSection } from './hooks/useUrlState'

const MINOR_VARIANTS: Array<{ id: MinorVariant; label: string; short: string }> = [
  { id: 'natural', label: 'Натуральный минор', short: 'Натуральный' },
  { id: 'harmonic', label: 'Гармонический минор', short: 'Гармонический' },
  { id: 'melodic-classical', label: 'Классический мелодический минор', short: 'Мелодический' },
  { id: 'melodic-jazz', label: 'Джазовый мелодический минор', short: 'Джазовый' },
]

const SECTIONS: Array<{ id: DetailSection; label: string; hint: string }> = [
  { id: 'notes', label: 'Ноты', hint: 'состав и весь гриф' },
  { id: 'scales', label: 'Гамма и TAB', hint: '5 систем и маршруты' },
  { id: 'chords', label: 'Аккорды', hint: 'гармония и формы' },
]

export default function App() {
  const [shareState, setShareState] = useUrlState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const instruments = listInstruments()
  const activeInstrument =
    getInstrument(shareState.instrument) ?? instruments[0]
  const activeUi = activeInstrument ? getInstrumentUi(activeInstrument.id) : undefined
  const scale = useMemo(
    () => buildScale(shareState.selection, shareState.minorVariant),
    [shareState.minorVariant, shareState.selection],
  )
  const activeNotes = useMemo(
    () => notesForDirection(scale, shareState.direction),
    [scale, shareState.direction],
  )
  const harmony = useMemo(() => harmonizeScale(activeNotes), [activeNotes])
  const keySignature = getKeySignature(shareState.selection)
  const selectedMajorPitch =
    shareState.selection.mode === 'major'
      ? shareState.selection.tonic
      : getRelativeMajorPitch(shareState.selection.tonic)
  const hasEnharmonicPair = [11, 6, 1].includes(selectedMajorPitch)
  const Workspace = activeUi?.Workspace

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#details-panel">Перейти к информации о тональности</a>
      <header className="site-header">
        <a href={import.meta.env.BASE_URL} className="brand" aria-label="Кварто — на главную">
          <span className="brand__mark" aria-hidden="true">
            <img
              src={`${import.meta.env.BASE_URL}quarto-logo.png`}
              width="768"
              height="512"
              alt=""
              draggable="false"
            />
          </span>
          <span>
            <strong>Кварто</strong>
            <small>музыкальная карта</small>
          </span>
        </a>
        <div className="header-actions">
          {instruments.length > 1 ? (
            <label className="instrument-select">
              <span>Инструмент</span>
              <select
                value={activeInstrument?.id}
                onChange={(event) =>
                  setShareState((state) => ({ ...state, instrument: event.target.value }))
                }
              >
                {instruments.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>{instrument.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="instrument-badge"><i aria-hidden="true">⌁</i>{activeInstrument?.label}</span>
          )}
          <button
            type="button"
            className="header-button"
            onClick={() => void copyLink()}
            aria-label="Скопировать ссылку на выбранную тональность"
          >
            {copied ? 'Ссылка скопирована' : 'Поделиться'}
          </button>
          <button type="button" className="primary-button" onClick={() => setSettingsOpen(true)}>
            Настроить инструмент
          </button>
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <span className="intro__kicker">Интерактивный справочник</span>
            <h1>Увидеть тональность.<br /><em>Сыграть её целиком.</em></h1>
          </div>
          <p>
            Выберите мажор или минор на круге — получите правильные ноты, весь гриф,
            позиционные TAB и аккордовые аппликатуры под ваш строй.
          </p>
        </section>

        <div className="main-layout">
          <section className="circle-panel" aria-label="Выбор тональности">
            <CircleOfFifths
              selection={shareState.selection}
              onSelect={(selection) => setShareState((state) => ({ ...state, selection }))}
            />
          </section>

          <section className="details-panel" id="details-panel" aria-live="polite">
            <div className="details-hero">
              <div className="details-hero__topline">
                <span className="key-signature-badge">
                  <i aria-hidden="true">{keySignature.accidental === 'sharp'
                    ? '♯'
                    : keySignature.accidental === 'flat'
                      ? '♭'
                      : '♮'}</i>
                  <span>{keySignature.label}</span>
                </span>
                {hasEnharmonicPair && (
                  <div className="segmented segmented--small" aria-label="Энгармоническое написание">
                    <button
                      type="button"
                      className={shareState.selection.spelling === 'sharp' ? 'is-active' : ''}
                      onClick={() =>
                        setShareState((state) => ({
                          ...state,
                          selection: { ...state.selection, spelling: 'sharp' },
                        }))
                      }
                    >
                      ♯ запись
                    </button>
                    <button
                      type="button"
                      className={shareState.selection.spelling === 'flat' ? 'is-active' : ''}
                      onClick={() =>
                        setShareState((state) => ({
                          ...state,
                          selection: { ...state.selection, spelling: 'flat' },
                        }))
                      }
                    >
                      ♭ запись
                    </button>
                  </div>
                )}
              </div>
              <div className="details-title-row">
                <div>
                  <span className="eyebrow">Выбранная тональность</span>
                  <h2>{keyDisplayName(shareState.selection)}</h2>
                  <p>{scale.label} · {scale.formula}</p>
                </div>
                <div className="tonic-orbit" aria-hidden="true">
                  <span>{scale.tonic.symbol}</span>
                </div>
              </div>

              {shareState.selection.mode === 'minor' && (
                <div className="variant-controls">
                  <span>Вид минора</span>
                  <div className="variant-scroll" role="group" aria-label="Вид минорной гаммы">
                    {MINOR_VARIANTS.map((variant) => (
                      <button
                        type="button"
                        key={variant.id}
                        className={shareState.minorVariant === variant.id ? 'is-active' : ''}
                        onClick={() =>
                          setShareState((state) => ({ ...state, minorVariant: variant.id }))
                        }
                        title={variant.label}
                      >
                        {variant.short}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {shareState.selection.mode === 'minor' &&
                shareState.minorVariant === 'melodic-classical' && (
                  <div className="direction-control">
                    <span>Направление меняет VI и VII ступени:</span>
                    <div className="segmented segmented--small">
                      <button
                        type="button"
                        className={shareState.direction === 'ascending' ? 'is-active' : ''}
                        onClick={() => setShareState((state) => ({ ...state, direction: 'ascending' }))}
                      >
                        ↑ Вверх
                      </button>
                      <button
                        type="button"
                        className={shareState.direction === 'descending' ? 'is-active' : ''}
                        onClick={() => setShareState((state) => ({ ...state, direction: 'descending' }))}
                      >
                        ↓ Вниз
                      </button>
                    </div>
                  </div>
                )}
            </div>

            <nav className="detail-tabs" aria-label="Разделы информации о тональности">
              {SECTIONS.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={shareState.section === section.id ? 'is-active' : ''}
                  aria-current={shareState.section === section.id ? 'page' : undefined}
                  onClick={() => setShareState((state) => ({ ...state, section: section.id }))}
                >
                  <strong>{section.label}</strong>
                  <span>{section.hint}</span>
                </button>
              ))}
            </nav>

            {Workspace ? (
              <Workspace
                scale={scale}
                activeNotes={activeNotes}
                harmony={harmony}
                shareState={shareState}
                section={shareState.section}
                settingsOpen={settingsOpen}
                onCloseSettings={() => setSettingsOpen(false)}
              />
            ) : (
              <div className="empty-state">
                <strong>Модуль инструмента не найден.</strong>
                <p>Выберите доступный инструмент в верхней панели.</p>
              </div>
            )}
          </section>
        </div>

        <section className="extension-note">
          <div className="extension-note__icon" aria-hidden="true">＋</div>
          <div>
            <span className="eyebrow">Архитектура для развития</span>
            <h2>Следом — бас и клавиши</h2>
            <p>
              Музыкальное ядро не зависит от грифа. Новые инструменты подключаются отдельным модулем:
              бас переиспользует ладовую механику, а пианино получает собственную клавиатуру и аппликатуры.
            </p>
          </div>
          <span className="extension-note__status">Предусмотрено</span>
        </section>
      </main>

      <footer>
        <span>Кварто · теория становится формой</span>
        <span>Все расчёты выполняются локально в браузере</span>
      </footer>
    </div>
  )
}
