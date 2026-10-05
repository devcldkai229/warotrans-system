// Minimal stroke-icon set (24x24 grid) so the mock UI needs no icon dependency.
const PATHS = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9Zm4.3 13a1.9 1.9 0 0 0 3.4 0',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  arrowLeft: 'M19 12H5m7-7-7 7 7 7',
  arrowRight: 'M5 12h14m-7-7 7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'm5 12 5 5 9-10',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5',
  download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  upload: 'M12 15V3m-5 5 5-5 5 5M5 21h14',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-9v.01',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5m0 3v.01',
  radio: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-4.2-4.2a6 6 0 0 0 0 8.4m8.4-8.4a6 6 0 0 1 0 8.4M4.9 5.9a10 10 0 0 0 0 12.2m14.2-12.2a10 10 0 0 1 0 12.2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2-1.2L14.600 3h-4l-.4 2.600a7.5 7.5 0 0 0-2 1.200l-2.300-.9-2 3.400 2 1.500a7.400 7.400 0 0 0 0 2.400l-2 1.500 2 3.400 2.300-.9a7.500 7.500 0 0 0 2 1.200l.4 2.600h4l.4-2.600a7.500 7.500 0 0 0 2-1.200l2.300.9 2-3.400-2-1.500c.1-.4.1-.8.1-1.200Z',
  sliders: 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6',
  layers: 'm12 2 10 5-10 5L2 7l10-5Zm10 10-10 5-10-5m20 5-10 5-10-5',
  filter: 'M3 4h18l-7 8.500V20l-4-2v-5.500L3 4Z',
  sort: 'M3 6h13M3 12h9M3 18h5m9-3 3 3 3-3m-3 3V6',
  history: 'M3 12a9 9 0 1 0 3-6.700L3 8m0-5v5h5m4-1v5l3 2',
  pause: 'M8 5v14m8-14v14',
  play: 'm7 4 13 8-13 8V4Z',
  stop: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.600 5.600l12.800 12.800',
  wrench: 'M14.700 6.300a4 4 0 0 0 5 5L21 17l-4 4-5.700-1.300L3 11l3-3 6.300 1.300 2.400-3Z',
  gamepad: 'M6 12h4m-2-2v4m7-1h.01M18 11h.01M17.300 5H6.700a4 4 0 0 0-3.900 3.200l-1.300 6.400A2.500 2.500 0 0 0 5.300 16L7 14h10l1.700 2a2.500 2.500 0 0 0 3.800-1.400l-1.300-6.400A4 4 0 0 0 17.300 5Z',
  crosshair: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v3m0 4v3M7 12h3m4 0h3',
  box: 'M21 8 12 3 3 8m18 0v8l-9 5m9-13-9 5m0 8-9-5V8m9 5v8M3 8l9 5',
  battery: 'M3 8h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm18 2v4',
  map: 'm9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  shield: 'M12 3 4 6v6c0 5 3.400 8 8 9 4.600-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm2 0V7a4 4 0 1 1 8 0v4',
  save: 'M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 0v5h7V3M7 21v-7h10v7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5m5 5H10a6 6 0 0 0 0 12h3',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9V9Zm-5 6V4h11',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  navigate: 'm3 11 18-8-8 18-2-8-8-2Z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  workflow: 'M3 12c3-6 6-6 9 0s6 6 9 0',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  fit: 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
}

export function Icon({ name, size = 16, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
