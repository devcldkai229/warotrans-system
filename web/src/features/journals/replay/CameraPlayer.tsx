import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { evidenceApi, type PlaybackGrant, type RecordingSpans } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { cameraState, correctDrift, mediaAt, type CameraState } from './replayModel'

interface CameraPlayerProps {
  robotCode: string
  spans: RecordingSpans | null
  hasRecording: boolean
  cursorMs: number
  playing: boolean
  rate: number
  /** The secondary player starts at the lowest rendition (two streams at once on a modest browser). */
  secondary?: boolean
}

const STATE_LABEL: Record<CameraState, string> = {
  PLAYING: '',
  NO_VIDEO_AT_TIME: t('No video at this time'),
  PROCESSING: t('Video still processing'),
  SYNC_UNCERTAIN: t('Sync uncertain'),
  NO_CAMERA: t('No camera recording'),
}

/**
 * One robot camera, driven by the global UTC cursor (never by another camera): the cursor is mapped through this
 * recording's measured spans to a media time; the player is sought or nudged back onto it. Where no span covers the
 * cursor the video is hidden and the reason shown — never a frozen last frame.
 */
export function CameraPlayer({ robotCode, spans, hasRecording, cursorMs, playing, rate, secondary = false }: CameraPlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls | null>(null)
  const [grant, setGrant] = useState<{ assetId: string; value: PlaybackGrant } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const position = useMemo(() => (spans ? mediaAt(spans.spans, cursorMs) : null), [spans, cursorMs])
  const processing = Boolean(spans?.assets.some((a) => a.status === 'QUEUED' || a.status === 'PROCESSING' || a.status === 'PENDING'))
  const state = error ? null : cameraState(position, processing, hasRecording)
  const assetId = position?.assetId ?? null

  // A grant per asset: short-lived, audited; renewed when the asset changes or the grant is about to expire.
  useEffect(() => {
    if (!assetId || (grant?.assetId === assetId && Date.parse(grant.value.expiresAtUtc) - Date.now() > 60_000)) return
    let cancelled = false
    evidenceApi
      .grant(assetId)
      .then((value) => !cancelled && setGrant({ assetId, value }))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [assetId, grant])

  useEffect(() => {
    const element = video.current
    if (!element || !grant) return
    setError(null)
    const query = grant.value.query
    if (Hls.isSupported()) {
      const instance = new Hls({
        // Every playlist and chunk request carries the signed policy (query mode); cookies travel by themselves.
        xhrSetup: (xhr, url) => {
          if (query) xhr.open('GET', url + (url.includes('?') ? '&' : '?') + query, true)
          xhr.withCredentials = grant.value.mode === 'cookie'
        },
        startLevel: secondary ? 0 : -1,
      })
      instance.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        if (secondary) {
          const lowest = data.levels.reduce((best, level, i) => (level.height < data.levels[best].height ? i : best), 0)
          instance.autoLevelCapping = lowest
        }
      })
      instance.on(Hls.Events.ERROR, (_e, data) => data.fatal && setError(`${data.type}: ${data.details}`))
      instance.loadSource(grant.value.masterUrl)
      instance.attachMedia(element)
      hls.current = instance
      return () => {
        instance.destroy()
        hls.current = null
      }
    }
    element.src = grant.value.masterUrl + (query ? `?${query}` : '')
    return () => {
      element.removeAttribute('src')
    }
  }, [grant, secondary])

  // Follow the cursor: seek when far off, nudge the speed when slightly off, pause when there is nothing to show.
  useEffect(() => {
    const element = video.current
    if (!element || !position || grant?.assetId !== position.assetId || state === 'NO_VIDEO_AT_TIME') {
      element?.pause()
      return
    }

    const action = correctDrift(position.seconds, element.currentTime, rate)
    if (action.kind === 'seek') element.currentTime = action.to
    element.playbackRate = action.kind === 'rate' ? action.rate : rate
    if (playing && element.paused) void element.play().catch(() => undefined)
    if (!playing && !element.paused) element.pause()
  }, [position, playing, rate, grant, state])

  const showVideo = state === 'PLAYING' || state === 'SYNC_UNCERTAIN'
  const overlayIcon: IconName = error ? 'alert' : state === 'PROCESSING' ? 'refresh' : state === 'NO_CAMERA' ? 'close' : 'clock'
  return (
    <figure className={cx('group relative overflow-hidden rounded-lg bg-black shadow-sm', secondary && 'ring-1 ring-black/10')}>
      <video ref={video} muted playsInline className={cx('aspect-video w-full', showVideo ? 'opacity-100' : 'opacity-0')} />
      <figcaption className={cx('absolute flex items-center gap-1.5', secondary ? 'left-1.5 top-1.5' : 'left-3 top-3')}>
        <span className={cx('rounded-sm bg-black/65 font-mono font-semibold text-white backdrop-blur-sm', secondary ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs')}>
          {robotCode}
          {spans?.nominalFovDegrees && !secondary ? <span className="font-normal text-white/70"> · {spans.nominalFovDegrees}°</span> : null}
        </span>
        {position && !secondary ? (
          <span className="rounded-sm bg-black/65 px-2 py-1 font-mono text-xs text-white/80 backdrop-blur-sm" title={t('Time sync of this frame')}>
            ±{Math.round(position.errorMs)} ms
          </span>
        ) : null}
      </figcaption>
      {state === 'SYNC_UNCERTAIN' ? (
        <span className="absolute right-3 top-3 rounded-sm bg-amber-400/95 px-2 py-1 text-xs font-semibold text-black">{STATE_LABEL.SYNC_UNCERTAIN}</span>
      ) : null}
      {!showVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-slate-800 to-slate-950 p-4 text-center text-white/80">
          <Icon name={overlayIcon} size={secondary ? 18 : 28} className={cx('text-white/60', state === 'PROCESSING' && 'animate-spin')} />
          <span className={secondary ? 'text-[11px]' : 'text-sm'}>{error ? `${t('Video error')}: ${error}` : state ? STATE_LABEL[state] : ''}</span>
        </div>
      ) : null}
    </figure>
  )
}
