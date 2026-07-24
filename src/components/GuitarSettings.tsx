import { useEffect } from 'react'
import {
  DEFAULT_GUITAR_PREFERENCES,
  GUITAR_PRESETS,
  midiToOctave,
  type GuitarPreferences,
} from '../instruments/guitar'
import { formatPitchClass, mod } from '../music/theory'

interface GuitarSettingsProps {
  preferences: GuitarPreferences
  onChange: (preferences: GuitarPreferences) => void
  onClose: () => void
}

const PITCH_OPTIONS = Array.from({ length: 12 }, (_, pitchClass) => pitchClass)

export function GuitarSettings({ preferences, onChange, onClose }: GuitarSettingsProps) {
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
    const preset = GUITAR_PRESETS.find((candidate) => candidate.id === presetId)
    if (!preset) return
    updateConfig({ ...config, presetId: preset.id, strings: [...preset.strings] })
  }

  const chooseStringCount = (count: number) => {
    const preset = GUITAR_PRESETS.find((candidate) => candidate.strings.length === count)
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
            <span className="eyebrow">Инструмент</span>
            <h2 id="settings-title">Настройка гитары</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Закрыть настройки" onClick={onClose} autoFocus>
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3>Количество струн</h3>
          <div className="segmented" aria-label="Количество струн">
            {[6, 7, 8].map((count) => (
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
          <label htmlFor="tuning-preset">Пресет строя</label>
          <select
            id="tuning-preset"
            value={config.presetId}
            onChange={(event) => choosePreset(event.target.value)}
          >
            {config.presetId === 'custom' && <option value="custom">Ручной строй</option>}
            {GUITAR_PRESETS.filter((preset) => preset.strings.length === config.strings.length).map(
              (preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ),
            )}
          </select>
        </section>

        <section className="settings-section">
          <h3>Открытые струны</h3>
          <p className="settings-hint">Струна 1 — самая тонкая. Нота задаётся вместе с октавой.</p>
          <div className="string-editor">
            {[...config.strings]
              .map((midi, stringIndex) => ({ midi, stringIndex }))
              .reverse()
              .map(({ midi, stringIndex }, visualIndex) => {
                const pitchClass = mod(midi)
                const octave = midiToOctave(midi)
                return (
                  <div className="string-editor__row" key={stringIndex}>
                    <span>Струна {visualIndex + 1}</span>
                    <select
                      aria-label={`Нота струны ${visualIndex + 1}`}
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
                      aria-label={`Октава струны ${visualIndex + 1}`}
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
            <span>Ладов: {config.frets}</span>
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
            <span>Ориентация</span>
            <select
              value={config.handedness}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  handedness: event.target.value === 'left' ? 'left' : 'right',
                })
              }
            >
              <option value="right">Праворукая</option>
              <option value="left">Леворукая</option>
            </select>
          </label>
        </section>

        <section className="settings-section practice-settings">
          <div>
            <h3>Подбор аппликатур</h3>
            <p className="settings-hint">Профиль меняет порядок рекомендаций и оценку удобства, но не скрывает формы.</p>
          </div>
          <div className="practice-setting-row">
            <span>Уровень</span>
            <div className="segmented segmented--small" aria-label="Уровень игры">
              {([
                ['beginner', 'Начинаю'],
                ['intermediate', 'Играю'],
                ['advanced', 'Продвинутый'],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={(preferences.playerLevel ?? 'intermediate') === value ? 'is-active' : ''}
                  onClick={() => onChange({ ...preferences, playerLevel: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="practice-setting-row">
            <span>Размер руки</span>
            <div className="segmented segmented--small" aria-label="Размер руки">
              {([
                ['small', 'Малый'],
                ['medium', 'Средний'],
                ['large', 'Большой'],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={(preferences.handSize ?? 'medium') === value ? 'is-active' : ''}
                  onClick={() => onChange({ ...preferences, handSize: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="practice-setting-row">
            <span>Предпочтение</span>
            <div className="segmented segmented--small" aria-label="Предпочтение по растяжке">
              {([
                ['compact', 'Компактно'],
                ['balanced', 'Баланс'],
                ['stretch', 'Растяжка'],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={(preferences.scaleReachProfile ?? 'balanced') === value ? 'is-active' : ''}
                  onClick={() => onChange({ ...preferences, scaleReachProfile: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section settings-grid">
          <label>
            <span>Темп: {preferences.tempo} BPM</span>
            <input
              type="range"
              min="40"
              max="180"
              value={preferences.tempo}
              onChange={(event) => onChange({ ...preferences, tempo: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Громкость: {Math.round(preferences.volume * 100)}%</span>
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
          onClick={() => onChange(structuredClone(DEFAULT_GUITAR_PREFERENCES))}
        >
          Сбросить настройки
        </button>
      </aside>
    </div>
  )
}
