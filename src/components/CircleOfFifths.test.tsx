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

  it('в режиме тренировки секторы не кликаются, а стрелка отрисована', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <CircleOfFifths
        selection={{ tonic: 0, mode: 'major', spelling: 'sharp' }}
        onSelect={onSelect}
        locked
        needleAngle={1530}
      />,
    )

    expect(screen.queryByRole('button', { name: 'G мажор' })).not.toBeInTheDocument()
    expect(container.querySelector('.circle-needle')).toBeInTheDocument()
    expect(screen.getByText('В тренировке тональность выбирает барабан')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
