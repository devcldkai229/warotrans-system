/** Wraps any angle to (-180, 180]. Degrees: 0 = facing +X (east), counter-clockwise positive. */
export function normalizeYaw(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

export function degToRad(degrees: number): number {
  return (normalizeYaw(degrees) * Math.PI) / 180
}

export function radToDeg(radians: number): number {
  return normalizeYaw((radians * 180) / Math.PI)
}
