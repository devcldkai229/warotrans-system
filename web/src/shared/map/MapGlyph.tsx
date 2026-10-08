import { createElement } from 'react'
import { MAP_GLYPHS } from './mapIcons'

interface MapGlyphProps {
  /** `robot` or an EndpointType. */
  icon: string
  /** Side of the icon in map units (metres on the map, pixels inside a legend swatch). */
  size: number
}

/** A Lucide icon drawn inside an SVG, centred on (0, 0). Colour comes from `currentColor`. */
export function MapGlyph({ icon, size }: MapGlyphProps) {
  const elements = MAP_GLYPHS[icon] ?? []
  return (
    <g className="wglyph" transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 24})`}>
      {elements.map(([tag, props], index) => createElement(tag, { key: index, ...props }))}
    </g>
  )
}
