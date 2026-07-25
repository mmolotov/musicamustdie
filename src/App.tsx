import { useMemo, useState } from 'react'
import { CircleOfFifths } from './components/CircleOfFifths'
import { getInstrument, listInstruments } from './instruments/registry'
import { getInstrumentUi } from './instruments/uiRegistry'
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
import { LANGS, setLang, useLang, useT } from './i18n'

const MINOR_VARIANTS: MinorVariant[] = ['natural', 'harmonic', 'melodic-classical', 'melodic-jazz']
const SECTIONS: DetailSection[] = ['notes', 'scales', 'chords']

export default function App() {
  const tr = useT()
  const lang = useLang()
  const [shareState, setShareState] = useUrlState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const instruments = listInstruments()
  const activeInstrument =
    getInstrument(shareState.instrument) ?? instruments[0]
  const activeUi = activeInstrument ? getInstrumentUi(activeInstrument.id) : undefined
  // `lang` is included so translated labels/spellings recompute on switch.
  const scale = useMemo(
    () => buildScale(shareState.selection, shareState.minorVariant),
    [shareState.minorVariant, shareState.selection, lang],
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
          {instruments.length > 1 ? (
            <label className="instrument-select">
              <span>{tr('header.instrument')}</span>
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
            aria-label={tr('header.shareAria')}
          >
            {copied ? tr('header.copied') : tr('header.share')}
          </button>
          <button type="button" className="primary-button" onClick={() => setSettingsOpen(true)}>
            {tr('header.configure')}
          </button>
        </div>
      </header>

      <main>
        <div className="main-layout">
          <section className="circle-panel" aria-label={tr('circle.panelAria')}>
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
              <div className="details-title-row">
                <div>
                  <span className="eyebrow">{tr('details.selectedKey')}</span>
                  <h2>{keyDisplayName(shareState.selection)}</h2>
                  <p>{scale.label} · {scale.formula}</p>
                </div>
                <div className="tonic-orbit" aria-hidden="true">
                  <span>{scale.tonic.symbol}</span>
                </div>
              </div>

              {shareState.selection.mode === 'minor' && (
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

              {shareState.selection.mode === 'minor' &&
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
                <strong>{tr('empty.title')}</strong>
                <p>{tr('empty.hint')}</p>
              </div>
            )}
          </section>
        </div>

      </main>
    </div>
  )
}
