import { useMemo, useState } from 'react'
import { CircleOfFifths } from './components/CircleOfFifths'
import { getInstrument, listInstruments } from './instruments/registry'
import { getInstrumentUi, type PracticeDelegate } from './instruments/uiRegistry'
import type { DetailSection } from './hooks/useUrlState'
import type { MinorVariant } from './music/types'
import {
  buildScale,
  getKeySignature,
  getRelativeMajorPitch,
  harmonizeScale,
  keyDisplayName,
  notesForDirection,
} from './music/theory'
import { useUrlState } from './hooks/useUrlState'
import { usePractice } from './hooks/usePractice'
import { PracticePanel } from './components/PracticePanel'
import { currentStep } from './practice/machine'
import { LANGS, setLang, useLang, useT } from './i18n'

// Instrument icons: "Guitar head" and "Guitar bass head" by Delapouite,
// game-icons.net — CC BY 3.0. See CREDITS.md. A guitar headstock (6 tuning
// pegs) and a bass headstock (4 pegs) — a matched, clearly distinct pair.
function GuitarGlyph() {
  return (
    <svg viewBox="0 0 512 512" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M152.6 26.32 137.2 441.9 256 486.4l118.8-44.5-15.4-415.58L256 41.09 152.6 26.32zM64 89c-36 0-36 78 0 78h9.51l13-39-13-39H64zm374.5 0-13 39 13 39h9.5c36 0 36-78 0-78h-9.5zM192 112a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm128 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-217.6 7 2.1 6.2 1 2.8-3 9h28l.7-18h-28.8zm278.4 0 .7 18h28.1l-2.1-6.2-1-2.8 3-9h-28.7zM60 217c-36 0-36 78 0 78h9.51l13-39-13-39H60zm382.5 0-13 39 13 39h9.5c36 0 36-78 0-78h-9.5zM192 240a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm128 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-221.56 7 2.06 6.2 1 2.8-3 9h27.3l.7-18H98.44zm287.06 0 .7 18h27.4l-2.1-6.2-1-2.8 3-9h-28zM56 345c-36 0-36 78 0 78h9.51l13-39-13-39H56zm390.5 0-13 39 13 39h9.5c36 0 36-78 0-78h-9.5zM192 368a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm128 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-225.53 7 2.07 6.2.95 2.8-3 9h26.61l.6-18H94.47zm295.83 0 .6 18h26.7l-2.1-6.2-1-2.8 3-9h-27.2z" />
    </svg>
  )
}

function BassGlyph() {
  return (
    <svg viewBox="0 0 512 512" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M228.2 26.89c-15.2-.25-27.7 33.46-12.3 39.8l8.9 3.61 17.8-15.5-1.8-23.5-8.7-3.6c-1.1-.43-2.1-.68-3.2-.78h-.7zm134.4 7.92h-2.3c-7.4.3-15.3 2.12-23.3 5.75-21.2 9.67-43.6 32.67-59.7 75.74L174.4 394.7l-.1.2v.2c.9.5 3.6 1.9 8 4 9.8 4.8 24 15.7 26.1 38.8v.5l-1 55.6H304c-.1-17.6 1.4-34.5 8.1-51.5 11.7-29.4 39.3-54.9 97-77 0-.2 0 0 .1-.4.3-2 .4-6 0-11-1-10.1-4-24.9-8.6-42.2-9.2-34.7-24.8-80.2-42.4-124.9l-2.4-6.2 5.2-4.2c36.1-28.2 51.1-56.4 53.8-79.56 2.7-23.06-6.5-41.48-21.3-52.25-8.7-6.31-19.3-9.99-30.9-10.02zM260.5 52.44l.7 10.01-7.6 6.6 21.7 8.93c1.2-2.17 2.5-4.28 3.8-6.33l4-9.89zm69 18.56c8.8 0 16 7.16 16 16s-7.2 16-16 16-16-7.16-16-16 7.2-16 16-16zm-136.7 49.7c-15.2-.3-27.9 33.4-12.3 39.8l8.8 3.6 17.8-15.5-1.7-23.6-8.8-3.6c-1.1-.4-2.1-.6-3.1-.7zm32.2 25.5.7 10-7.6 6.6 19.9 8.1 6.2-16.8zm71.6 19.8c8.8 0 16 7.2 16 16s-7.2 16-16 16-16-7.2-16-16 7.2-16 16-16zm-139.8 50.6c-15.3-.3-27.8 33.4-12.4 39.8l8.9 3.6 17.8-15.5-1.8-23.6-8.7-3.6c-1.1-.4-2.1-.6-3.1-.7zm32.2 25.5.7 10-7.6 6.6 20.4 8.3 6.2-16.8zm67.2 19.3c8.8 0 16 7.2 16 16s-7.2 16-16 16-16-7.2-16-16 7.2-16 16-16zm-140.1 54.4c-15.2-.3-27.78 33.4-12.3 39.8l8.8 3.6 17.8-15.5-1.8-23.6-8.7-3.6c-1.1-.4-2.1-.6-3.1-.7zm32.2 25.5.7 10-7.6 6.6 22.8 9.3 6.8-16.6zm69.3 18.5c8.8 0 16 7.2 16 16s-7.2 16-16 16-16-7.2-16-16 7.2-16 16-16z" />
    </svg>
  )
}

function InstrumentIcon({ instrumentId }: { instrumentId: string }) {
  return instrumentId === 'bass-guitar' ? <BassGlyph /> : <GuitarGlyph />
}

const MINOR_VARIANTS: MinorVariant[] = ['natural', 'harmonic', 'melodic-classical', 'melodic-jazz']
const SECTIONS: DetailSection[] = ['notes', 'scales', 'chords']

export default function App() {
  const tr = useT()
  const lang = useLang()
  const [shareState, setShareState] = useUrlState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const practice = usePractice()
  const practiceActive = shareState.practice
  // While the needle is still turning the drawn key is withheld, so the round
  // on screen stays the previous one instead of spoiling the answer.
  const practiceSelection = practiceActive ? practice.state.selection : null
  const selection = practiceSelection ?? shareState.selection
  const practiceAwaitingKey = practiceActive && practiceSelection === null
  const hintsHidden = practiceActive && practice.state.phase !== 'revealed'
  const practiceStep = practiceActive ? currentStep(practice.state) : null
  const practiceRevealed = practice.state.phase === 'revealed'
  // The fingering library and the chord shapes live in the instrument module,
  // so those two steps hand the round's draw over and let it resolve them.
  const practiceDelegate: PracticeDelegate | undefined =
    practiceStep === 'scale' || (practiceStep === 'chord' && practiceRevealed)
      ? {
          step: practiceStep,
          pick: practice.state.patternPick,
          chordDegree: practice.state.chordDegree,
          revealed: practiceRevealed,
        }
      : undefined
  // Everything the workspace draws is part of some answer, so it only appears
  // on the steps that have been revealed.
  const practiceShowsWorkspace =
    practiceDelegate !== undefined || (practiceStep === 'notes' && practiceRevealed)
  const practiceSection: DetailSection =
    practiceStep === 'scale' ? 'scales' : practiceStep === 'chord' ? 'chords' : 'notes'
  // Practice always drills the ascending form; the descending melodic minor is
  // a question for the fretboard step.
  const direction = practiceActive ? 'ascending' : shareState.direction
  const instruments = listInstruments()
  const activeInstrument =
    getInstrument(shareState.instrument) ?? instruments[0]
  const activeUi = activeInstrument ? getInstrumentUi(activeInstrument.id) : undefined
  // `lang` is included so translated labels/spellings recompute on switch.
  const scale = useMemo(
    () => buildScale(selection, shareState.minorVariant),
    [shareState.minorVariant, selection, lang],
  )
  const activeNotes = useMemo(() => notesForDirection(scale, direction), [scale, direction])
  const harmony = useMemo(() => harmonizeScale(activeNotes), [activeNotes])
  const keySignature = getKeySignature(selection)
  const selectedMajorPitch =
    selection.mode === 'major' ? selection.tonic : getRelativeMajorPitch(selection.tonic)
  const hasEnharmonicPair = [11, 6, 1].includes(selectedMajorPitch)
  const Workspace = activeUi?.Workspace
  const workspaceShareState = practiceActive
    ? { ...shareState, selection, direction }
    : shareState

  const startPractice = () =>
    setShareState((state) => ({ ...state, practice: true, direction: 'ascending', section: 'notes' }))
  const stopPractice = () =>
    setShareState((state) => ({
      ...state,
      practice: false,
      // Leave the player on the key they were just drilling.
      selection: practice.state.selection ?? state.selection,
    }))

  return (
    <div className="app-shell">
      <a className="skip-link" href="#details-panel">{tr('skip.toDetails')}</a>
      <header className="site-header">
        <a href={import.meta.env.BASE_URL} className="brand" aria-label={tr('brand.homeAria')}>
          <img
            className="brand__logo"
            src={`${import.meta.env.BASE_URL}musicamustdie-logo.png`}
            width="760"
            height="237"
            alt=""
            draggable="false"
          />
        </a>
        <div className="header-actions">
          <button
            type="button"
            className={practiceActive ? 'practice-toggle is-active' : 'practice-toggle'}
            aria-pressed={practiceActive}
            onClick={practiceActive ? stopPractice : startPractice}
          >
            {practiceActive ? tr('practice.exit') : tr('practice.toggle')}
          </button>
          <div className="lang-switch" role="group" aria-label={tr('lang.aria')}>
            {LANGS.map((code) => (
              <button
                type="button"
                key={code}
                className={lang === code ? 'is-active' : ''}
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main>
        <div className="main-layout">
          <section className="circle-panel" aria-label={tr('circle.panelAria')}>
            <CircleOfFifths
              selection={selection}
              onSelect={(next) => setShareState((state) => ({ ...state, selection: next }))}
              locked={practiceActive}
              needleAngle={practiceActive ? practice.state.needleAngle : null}
              spinning={practice.state.phase === 'spinning'}
            />
          </section>

          <section className="details-panel" id="details-panel" aria-live="polite">
            <div className="details-hero">
              <div className="details-hero__topline">
                <div className="topline-left">
                {hintsHidden ? (
                  <span className="key-signature-badge is-hidden">
                    <i aria-hidden="true">?</i>
                    <span>{tr('practice.hidden')}</span>
                  </span>
                ) : (
                  <span className="key-signature-badge">
                    <i aria-hidden="true">{keySignature.accidental === 'sharp'
                      ? '♯'
                      : keySignature.accidental === 'flat'
                        ? '♭'
                        : '♮'}</i>
                    <span>{keySignature.label}</span>
                  </span>
                )}
                {!practiceActive && hasEnharmonicPair && (
                  <div className="segmented segmented--small" aria-label={tr('enharmonic.aria')}>
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
                      {tr('enharmonic.sharp')}
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
                      {tr('enharmonic.flat')}
                    </button>
                  </div>
                )}
                </div>
                {activeInstrument && (
                  <div className="instrument-controls">
                    {instruments.length > 1 && (
                      <div className="instrument-switch" role="group" aria-label={tr('header.instrument')}>
                        {instruments.map((instrument) => {
                          const active = instrument.id === activeInstrument.id
                          return (
                            <button
                              type="button"
                              key={instrument.id}
                              className={active ? 'is-active' : ''}
                              aria-pressed={active}
                              onClick={() =>
                                setShareState((state) => ({ ...state, instrument: instrument.id }))
                              }
                            >
                              <InstrumentIcon instrumentId={instrument.id} />
                              <span>{instrument.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      className="primary-button primary-button--compact"
                      onClick={() => setSettingsOpen(true)}
                    >
                      {tr('header.configure')}
                    </button>
                  </div>
                )}
              </div>
              <div className="details-title-row">
                <div>
                  <span className="eyebrow">
                    {practiceAwaitingKey ? tr('practice.eyebrow') : tr('details.selectedKey')}
                  </span>
                  <h2>{practiceAwaitingKey ? tr('practice.noKeyYet') : keyDisplayName(selection)}</h2>
                  <p>
                    {practiceAwaitingKey ? (
                      tr('practice.noKeyHint')
                    ) : (
                      <>
                        {scale.label}
                        {!hintsHidden && <> · {scale.formula}</>}
                      </>
                    )}
                  </p>
                </div>
                {!practiceAwaitingKey && (
                  <div className="tonic-orbit" aria-hidden="true">
                    <span>{scale.tonic.symbol}</span>
                  </div>
                )}
              </div>

              {selection.mode === 'minor' && (
                <div className="variant-controls">
                  <span>{tr('minor.kind')}</span>
                  <div className="variant-scroll" role="group" aria-label={tr('minor.kindAria')}>
                    {MINOR_VARIANTS.map((variant) => (
                      <button
                        type="button"
                        key={variant}
                        className={shareState.minorVariant === variant ? 'is-active' : ''}
                        onClick={() =>
                          setShareState((state) => ({ ...state, minorVariant: variant }))
                        }
                        title={tr(`minorVariant.${variant}`)}
                      >
                        {tr(`minorVariant.${variant}.short`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!practiceActive &&
                selection.mode === 'minor' &&
                shareState.minorVariant === 'melodic-classical' && (
                  <div className="direction-control">
                    <span>{tr('direction.hint')}</span>
                    <div className="segmented segmented--small">
                      <button
                        type="button"
                        className={shareState.direction === 'ascending' ? 'is-active' : ''}
                        onClick={() => setShareState((state) => ({ ...state, direction: 'ascending' }))}
                      >
                        {tr('direction.up')}
                      </button>
                      <button
                        type="button"
                        className={shareState.direction === 'descending' ? 'is-active' : ''}
                        onClick={() => setShareState((state) => ({ ...state, direction: 'descending' }))}
                      >
                        {tr('direction.down')}
                      </button>
                    </div>
                  </div>
                )}
            </div>

            {practiceActive ? (
              <PracticePanel
                state={practice.state}
                scale={scale}
                harmony={harmony}
                onSpin={practice.spin}
                onLandNeedle={practice.landNeedle}
                onReveal={practice.reveal}
                onAnswer={practice.answer}
                onNext={practice.next}
              >
                {practiceShowsWorkspace && Workspace && (
                  <Workspace
                    // A fresh mount per step: the assignment and the chord
                    // shapes are picked when the view first renders.
                    key={`${activeInstrument?.id}-${practice.state.round}-${practiceStep}`}
                    scale={scale}
                    activeNotes={activeNotes}
                    harmony={harmony}
                    shareState={workspaceShareState}
                    section={practiceSection}
                    settingsOpen={settingsOpen}
                    onCloseSettings={() => setSettingsOpen(false)}
                    practice={practiceDelegate}
                  />
                )}
              </PracticePanel>
            ) : (
              <>
                <nav className="detail-tabs" aria-label={tr('tabs.aria')}>
                  {SECTIONS.map((section) => (
                    <button
                      type="button"
                      key={section}
                      className={shareState.section === section ? 'is-active' : ''}
                      aria-current={shareState.section === section ? 'page' : undefined}
                      onClick={() => setShareState((state) => ({ ...state, section }))}
                    >
                      <strong>{tr(`tabs.${section}`)}</strong>
                      <span>{tr(`tabs.${section}.hint`)}</span>
                    </button>
                  ))}
                </nav>

                {Workspace ? (
                  <Workspace
                    key={activeInstrument?.id}
                    scale={scale}
                    activeNotes={activeNotes}
                    harmony={harmony}
                    shareState={workspaceShareState}
                    section={shareState.section}
                    settingsOpen={settingsOpen}
                    onCloseSettings={() => setSettingsOpen(false)}
                  />
                ) : (
                  <div className="empty-state">
                    <strong>{tr('empty.title')}</strong>
                    <p>{tr('empty.hint')}</p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

      </main>
    </div>
  )
}
