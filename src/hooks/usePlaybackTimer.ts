import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePlaybackTimerOptions {
  enabled: boolean
  watch: number
  getDurationMs: () => number | null
  onTick: () => void
  minDelayFactor?: number
}

export function usePlaybackTimer({
  enabled,
  watch,
  getDurationMs,
  onTick,
  minDelayFactor = 0.75,
}: UsePlaybackTimerOptions) {
  const effectiveMinDelayFactor = Math.max(0, Math.min(1, minDelayFactor))
  const [isPlaying, setIsPlaying] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const expectedTimeRef = useRef(0)
  const isFirstScheduleRef = useRef(true)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleNext = useCallback(
    (isFirstChunk: boolean) => {
      clearTimer()

      if (!isPlaying || !enabled) {
        return
      }

      const duration = getDurationMs()
      if (duration == null || duration <= 0) {
        setIsPlaying(false)
        return
      }

      const now = performance.now()

      if (isFirstChunk) {
        expectedTimeRef.current = now + duration
      } else {
        expectedTimeRef.current += duration
      }

      const minDelay = duration * effectiveMinDelayFactor
      const delay = Math.max(minDelay, expectedTimeRef.current - now)

      timeoutRef.current = window.setTimeout(() => {
        onTick()
      }, delay)
    },
    [clearTimer, enabled, getDurationMs, isPlaying, effectiveMinDelayFactor, onTick]
  )

  useEffect(() => {
    if (!isPlaying || !enabled) {
      clearTimer()
      if (!enabled) {
        // Re-enabled playback should schedule from "now", not stale expected time.
        isFirstScheduleRef.current = true
      }
      return
    }

    const isFirst = isFirstScheduleRef.current
    isFirstScheduleRef.current = false
    scheduleNext(isFirst)

    return clearTimer
  }, [isPlaying, enabled, watch, scheduleNext, clearTimer])

  const play = useCallback(() => {
    if (!isPlaying) {
      isFirstScheduleRef.current = true
      setIsPlaying(true)
    }
  }, [isPlaying])

  const pause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
      clearTimer()
    }
  }, [clearTimer, isPlaying])

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, pause, play])

  return {
    isPlaying,
    play,
    pause,
    toggle,
  }
}
