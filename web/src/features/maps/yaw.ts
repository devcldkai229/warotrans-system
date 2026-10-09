/** Wraps any angle to (-180, 180]. Yaw is in degrees, 0 = facing +X (east), counter-clockwise positive. */
export function normalizeYaw(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}
