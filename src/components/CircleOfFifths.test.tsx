import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CircleOfFifths } from './CircleOfFifths'

describe('CircleOfFifths', () => {
  it('выбирает внешнюю мажорную и внутреннюю минорную часть', () => {
    const onSelect = vi.fn()
    render(
      <CircleOfFifths
        selection={{ tonic: 0, mode: 'major', spelling: 'sharp' }}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'G мажор' }))
    expect(onSelect).toHaveBeenLastCalledWith({ tonic: 7, mode: 'major', spelling: 'sharp' })

    fireEvent.click(screen.getByRole('button', { name: 'Am минор' }))
    expect(onSelect).toHaveBeenLastCalledWith({ tonic: 9, mode: 'minor', spelling: 'sharp' })
  })

  it('поддерживает выбор с клавиатуры', () => {
    const onSelect = vi.fn()
    render(
      <CircleOfFifths
        selection={{ tonic: 0, mode: 'major', spelling: 'sharp' }}
        onSelect={onSelect}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'C мажор' }), { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith({ tonic: 7, mode: 'major', spelling: 'sharp' })
  })

  it('в тренировке рисует стрелку и свою подпись, но остаётся кликабельным', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <CircleOfFifths
        selection={{ tonic: 0, mode: 'major', spelling: 'sharp' }}
        onSelect={onSelect}
        caption="Нажмите сектор, чтобы тренировать эту тональность"
        needleAngle={1530}
        hideSignature
      />,
    )

    expect(container.querySelector('.circle-needle')).toBeInTheDocument()
    expect(screen.getByText('Нажмите сектор, чтобы тренировать эту тональность')).toBeInTheDocument()
    // Знаки при ключе — ответ на первый шаг, поэтому в центре их не видно.
    expect(screen.queryByText('без знаков')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Am минор' }))
    expect(onSelect).toHaveBeenCalledWith({ tonic: 9, mode: 'minor', spelling: 'sharp' })
  })
})
