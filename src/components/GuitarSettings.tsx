import { useEffect } from 'react'
import {
  midiToOctave,
  presetLabel,
  type GuitarPreferences,
  type GuitarPreset,
} from '../instruments/guitar'
import { formatPitchClass, mod } from '../music/theory'
import { useT } from '../i18n'

interface GuitarSettingsProps {
  preferences: GuitarPreferences
  onChange: (preferences: GuitarPreferences) => void
  onClose: () => void
  presets: GuitarPreset[]
  stringCounts: number[]
  defaultPreferences: GuitarPreferences
}

const PITCH_OPTIONS = Array.from({ length: 12 }, (_, pitchClass) => pitchClass)

export function GuitarSettings({
  preferences,
  onChange,
  onClose,
  presets,
  stringCounts,
  defaultPreferences,
}: GuitarSettingsProps) {
  const tr = useT()
  const { config } = preferences

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const updateConfig = (nextConfig: GuitarPreferences['config']) => {
    onChange({
      ...preferences,
      config: nextConfig,
      constraints: {
        ...preferences.constraints,
        fretTo: Math.min(preferences.constraints.fretTo, nextConfig.frets),
        minSoundingStrings: Math.min(preferences.constraints.minSoundingStrings, nextConfig.strings.length),
      },
    })
  }

  const choosePreset = (presetId: string) => {
    const preset = presets.find((candidate) => candidate.id === presetId)
    if (!preset) return
    updateConfig({ ...config, presetId: preset.id, strings: [...preset.strings] })
  }

  const chooseStringCount = (count: number) => {
    const preset = presets.find((candidate) => candidate.strings.length === count)
    if (preset) choosePreset(preset.id)
  }

  const updateString = (stringIndex: number, pitchClass: number, octave: number) => {
    const strings = [...config.strings]
    strings[stringIndex] = (octave + 1) * 12 + pitchClass
    updateConfig({ ...config, presetId: 'custom', strings })
  }

  return (
    <div className="settings-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-panel__header">
          <div>
            <span className="eyebrow">{tr('header.instrument')}</span>
            <h2 id="settings-title">{tr('settings.title')}</h2>
          </div>
          <button type="button" className="icon-button" aria-label={tr('settings.close')} onClick={onClose} autoFocus>
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3>{tr('settings.stringCount')}</h3>
          <div className="segmented" aria-label={tr('settings.stringCount')}>
            {stringCounts.map((count) => (
              <button
                type="button"
                key={count}
                className={config.strings.length === count ? 'is-active' : ''}
                onClick={() => chooseStringCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <label htmlFor="tuning-preset">{tr('settings.tuningPreset')}</label>
          <select
            id="tuning-preset"
            value={config.presetId}
            onChange={(event) => choosePreset(event.target.value)}
          >
            {config.presetId === 'custom' && <option value="custom">{tr('settings.customTuning')}</option>}
            {presets.filter((preset) => preset.strings.length === config.strings.length).map(
              (preset) => (
                <option key={preset.id} value={preset.id}>
                  {presetLabel(preset)}
                </option>
              ),
            )}
          </select>
        </section>

        <section className="settings-section">
          <h3>{tr('settings.openStrings')}</h3>
          <p className="settings-hint">{tr('settings.openStringsHint')}</p>
          <div className="string-editor">
            {[...config.strings]
              .map((midi, stringIndex) => ({ midi, stringIndex }))
              .reverse()
              .map(({ midi, stringIndex }, visualIndex) => {
                const pitchClass = mod(midi)
                const octave = midiToOctave(midi)
                return (
                  <div className="string-editor__row" key={stringIndex}>
                    <span>{tr('settings.string', { n: visualIndex + 1 })}</span>
                    <select
                      aria-label={tr('settings.stringNoteAria', { n: visualIndex + 1 })}
                      value={pitchClass}
                      onChange={(event) => updateString(stringIndex, Number(event.target.value), octave)}
                    >
                      {PITCH_OPTIONS.map((pitch) => (
                        <option key={pitch} value={pitch}>
                          {formatPitchClass(pitch, 'sharp')}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={tr('settings.stringOctaveAria', { n: visualIndex + 1 })}
                      value={octave}
                      onChange={(event) =>
                        updateString(stringIndex, pitchClass, Number(event.target.value))
                      }
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
          </div>
        </section>

        <section className="settings-section settings-grid">
          <label>
            <span>{tr('settings.frets', { n: config.frets })}</span>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={config.frets}
              onChange={(event) =>
                updateConfig({ ...config, frets: Number(event.target.value), presetId: config.presetId })
              }
            />
          </label>
          <label>
            <span>{tr('settings.orientation')}</span>
            <select
              value={config.handedness}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  handedness: event.target.value === 'left' ? 'left' : 'right',
                })
              }
            >
              <option value="right">{tr('settings.rightHanded')}</option>
              <option value="left">{tr('settings.leftHanded')}</option>
            </select>
          </label>
        </section>

        <section className="settings-section practice-settings">
          <div>
            <h3>{tr('settings.fingering')}</h3>
            <p className="settings-hint">{tr('settings.fingeringHint')}</p>
          </div>
          <div className="practice-setting-row">
            <span>{tr('settings.level')}</span>
            <div className="segmented segmented--small" aria-label={tr('settings.levelAria')}>
              {([
                ['beginner', 'settings.level.beginner'],
                ['intermediate', 'settings.level.intermediate'],
                ['advanced', 'settings.level.advanced'],
              ] as const).map(([value, key]) => (
                <button
                  type="button"
                  key={value}
                  className={(preferences.playerLevel ?? 'intermediate') === value ? 'is-active' : ''}
                  onClick={() => onChange({ ...preferences, playerLevel: value })}
                >
                  {tr(key)}
                </button>
              ))}
            </div>
          </div>
          <div className="practice-setting-row">
            <span>{tr('settings.handSize')}</span>
            <div className="segmented segmented--small" aria-label={tr('settings.handSize')}>
              {([
                ['small', 'settings.hand.small'],
                ['medium', 'settings.hand.medium'],
                ['large', 'settings.hand.large'],
              ] as const).map(([value, key]) => (
                <button
                  type="button"
                  key={value}
                  className={(preferences.handSize ?? 'medium') === value ? 'is-active' : ''}
                  onClick={() => onChange({ ...preferences, handSize: value })}
                >
                  {tr(key)}
                </button>
              ))}
            </div>
          </div>
          <div className="practice-setting-row">
            <span>{tr('settings.reach')}</span>
            <div className="segmented segmented--small" aria-label={tr('settings.reachAria')}>
              {([
                ['compact', 'settings.reach.compact'],
                ['balanced', 'settings.reach.balanced'],
                ['stretch', 'settings.reach.stretch'],
              ] as const).map(([value, key]) => (
                <button
                  type="button"
                  key={value}
                  className={(preferences.scaleReachProfile ?? 'balanced') === value ? 'is-active' : ''}
                  onClick={() => onChange({ ...preferences, scaleReachProfile: value })}
                >
                  {tr(key)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section settings-grid">
          <label>
            <span>{tr('settings.tempo', { n: preferences.tempo })}</span>
            <input
              type="range"
              min="40"
              max="180"
              value={preferences.tempo}
              onChange={(event) => onChange({ ...preferences, tempo: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>{tr('settings.volume', { n: Math.round(preferences.volume * 100) })}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={preferences.volume}
              onChange={(event) => onChange({ ...preferences, volume: Number(event.target.value) })}
            />
          </label>
        </section>

        <button
          type="button"
          className="secondary-button settings-reset"
          onClick={() => onChange(structuredClone(defaultPreferences))}
        >
          {tr('settings.reset')}
        </button>
      </aside>
    </div>
  )
}
