import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlaybackTimer } from './usePlaybackTimer'

interface TestProps {
  enabled: boolean
  watch: number
}

describe('usePlaybackTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('ticks repeatedly while playing and enabled', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 50,
          onTick,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('stops emitting ticks after pause', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 50,
          onTick,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.pause()
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(onTick).toHaveBeenCalledTimes(1)
  })

  it('clamps minDelayFactor above 1 down to 1', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 100,
          onTick,
          minDelayFactor: 2,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(99)
    })
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('clamps minDelayFactor below 0 up to 0', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')

    const nowValues = [0, 500]
    let nowIndex = 0
    vi.spyOn(performance, 'now').mockImplementation(() => {
      return nowValues[Math.min(nowIndex++, nowValues.length - 1)]
    })

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 100,
          onTick,
          minDelayFactor: -2,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    const secondDelay = setTimeoutSpy.mock.calls[1]?.[1] as number | undefined
    expect(secondDelay).toBe(0)
  })

  it('resets expected schedule timing after pause and resume', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 100,
          onTick,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.pause()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.play()
    })
    act(() => {
      vi.advanceTimersByTime(99)
    })
    expect(onTick).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('handles enabled flips while playing without leaking ticks', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 100,
          onTick,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      rerender({ enabled: false, watch })
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      rerender({ enabled: true, watch })
    })
    act(() => {
      vi.advanceTimersByTime(99)
    })
    expect(onTick).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('stops playback when duration is null or non-positive', () => {
    const { result: nullDuration } = renderHook(() =>
      usePlaybackTimer({
        enabled: true,
        watch: 0,
        getDurationMs: () => null,
        onTick: vi.fn(),
      })
    )

    act(() => {
      nullDuration.current.play()
    })

    expect(nullDuration.current.isPlaying).toBe(false)

    const { result: zeroDuration } = renderHook(() =>
      usePlaybackTimer({
        enabled: true,
        watch: 0,
        getDurationMs: () => 0,
        onTick: vi.fn(),
      })
    )

    act(() => {
      zeroDuration.current.play()
    })

    expect(zeroDuration.current.isPlaying).toBe(false)
  })
})
