/**
 * Unit tests for the useDebounce hook.
 * Verifies that the debounced value only updates after the delay.
 */
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useDebounce } from '../../hooks/useDebounce'

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 350))
    expect(result.current).toBe('hello')
  })

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 350),
      { initialProps: { value: 'initial' } }
    )
    rerender({ value: 'updated' })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('initial')
  })

  it('updates after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 350),
      { initialProps: { value: 'initial' } }
    )
    rerender({ value: 'updated' })
    act(() => vi.advanceTimersByTime(350))
    expect(result.current).toBe('updated')
  })

  it('resets the timer on rapid changes (debounce behaviour)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 350),
      { initialProps: { value: 'a' } }
    )
    rerender({ value: 'b' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'c' })
    act(() => vi.advanceTimersByTime(200))
    // Only 200ms since last change — should still be 'a'
    expect(result.current).toBe('a')

    // Now let the full delay pass
    act(() => vi.advanceTimersByTime(350))
    expect(result.current).toBe('c')
  })

  it('uses 350ms as the default delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'start' } }
    )
    rerender({ value: 'end' })
    act(() => vi.advanceTimersByTime(349))
    expect(result.current).toBe('start')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('end')
  })

  it('handles empty string values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 350),
      { initialProps: { value: 'hello' } }
    )
    rerender({ value: '' })
    act(() => vi.advanceTimersByTime(350))
    expect(result.current).toBe('')
  })
})
