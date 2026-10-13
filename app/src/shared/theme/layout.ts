import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Height of the status bar painted inside the web phone frame by `App.tsx`.
 * The two must stay in sync or the header will overlap the fake clock.
 */
export const SIMULATED_STATUS_BAR = 44;

/** Breathing room between the simulated status bar and the header content. */
const SIMULATED_STATUS_BAR_GAP = 4;

/**
 * Top inset for full-bleed headers.
 *
 * This collapses two genuinely different jobs that previously shared a single
 * hardcoded `48`:
 *
 *  - **web** — the browser reports no safe area, so we reserve room for the
 *    simulated notch / status bar that `App.tsx` draws inside the phone frame.
 *  - **native** — the OS reports the real inset, which ranges from 20pt (SE)
 *    through 47pt (iPhone 12/13) to 59pt (Dynamic Island on 14/15/16 Pro).
 *
 * Must be called inside a `SafeAreaProvider`.
 */
export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'web'
    ? SIMULATED_STATUS_BAR + SIMULATED_STATUS_BAR_GAP
    : insets.top;
}

/**
 * Floating navigation dock metrics.
 *
 * The dock is `position: absolute` over the screen, so it carries no automatic
 * safe-area handling. Screens that dock content to the bottom of the viewport
 * must clear it via `dockReservedSpace()` instead of a hand-tuned padding.
 *
 * Previously the clearance was three independent magic numbers
 * (`map.minHeight`, `sheet.paddingBottom` of 78/70, and `dockWrapper.bottom`),
 * which summed to roughly 2pt of slack on iPhone 12 — one font-metric change
 * away from the dock clipping the content above it.
 */
export const dockMetrics = {
  /** Distance from the physical bottom edge of the screen to the dock pill. */
  bottomOffset: Platform.select({ android: 16, default: 24 }),
  /** Breathing room between the dock and the content it floats over. */
  gutter: 8,
} as const;

/**
 * Bottom padding a screen needs so its content clears the floating dock.
 * @param dockHeight Measured pill height reported by BottomTabBar via onLayout.
 */
export function dockReservedSpace(dockHeight: number): number {
  return dockHeight + dockMetrics.bottomOffset + dockMetrics.gutter;
}