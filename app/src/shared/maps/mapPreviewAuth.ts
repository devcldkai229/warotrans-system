export const MAP_PREVIEW_MIN_TOKEN_SECONDS = 30;

export function shouldProactivelyRefreshMapToken(
  token: string | null | undefined,
  secondsLeft: number | null,
  minSeconds = MAP_PREVIEW_MIN_TOKEN_SECONDS,
): boolean {
  return Boolean(token && secondsLeft !== null && secondsLeft <= minSeconds);
}

export function isTokenExpired(
  token: string | null | undefined,
  secondsLeft: number | null,
): boolean {
  return Boolean(token && secondsLeft !== null && secondsLeft <= 0);
}

export interface MapPreviewAuthDeps {
  getToken: () => string | null;
  tokenSecondsLeft: (token: string | null) => number | null;
  refreshToken: (minSeconds?: number) => Promise<string | null>;
  isBackendAsset: () => boolean;
}

export interface MapPreviewPrepareResult {
  ok: boolean;
  refreshed: boolean;
  token: string | null;
}

export interface MapPreviewErrorResult {
  retried: boolean;
  token: string | null;
  attempt: number;
}

/**
 * Coordinates reactive JWT expiry checks and single-shot refresh-and-retry for backend `/map-assets/` images.
 * External map URLs bypass token refresh completely.
 */
export function createMapPreviewAuthController(deps: MapPreviewAuthDeps) {
  let refreshRetried = false;
  let failed = false;
  let manualAttempt = 0;

  async function prepare(): Promise<MapPreviewPrepareResult> {
    if (!deps.isBackendAsset()) {
      failed = false;
      return { ok: true, refreshed: false, token: null };
    }
    const token = deps.getToken();
    if (!token) {
      return { ok: true, refreshed: false, token: null };
    }
    const secondsLeft = deps.tokenSecondsLeft(token);
    if (!shouldProactivelyRefreshMapToken(token, secondsLeft)) {
      return { ok: true, refreshed: false, token };
    }
    const expired = isTokenExpired(token, secondsLeft);
    try {
      const nextToken = await deps.refreshToken(MAP_PREVIEW_MIN_TOKEN_SECONDS);
      if (expired && (!nextToken || nextToken === token)) {
        failed = true;
        return { ok: false, refreshed: false, token: null };
      }
      const effectiveToken = nextToken ?? token;
      failed = false;
      return {
        ok: true,
        refreshed: Boolean(nextToken && nextToken !== token),
        token: effectiveToken,
      };
    } catch {
      if (expired) {
        failed = true;
        return { ok: false, refreshed: false, token: null };
      }
      return { ok: true, refreshed: false, token };
    }
  }

  async function onImageError(failedToken: string | null): Promise<MapPreviewErrorResult> {
    if (!deps.isBackendAsset() || refreshRetried || failed) {
      failed = true;
      return { retried: false, token: deps.getToken(), attempt: manualAttempt };
    }
    refreshRetried = true;
    try {
      // Force a fresh token once on image load failure (even under client clock skew).
      const nextToken = await deps.refreshToken(Number.POSITIVE_INFINITY);
      if (nextToken && nextToken !== failedToken) {
        failed = false;
        manualAttempt += 1;
        return { retried: true, token: nextToken, attempt: manualAttempt };
      }
    } catch {
      // Fall through to safe error state.
    }
    failed = true;
    return { retried: false, token: deps.getToken(), attempt: manualAttempt };
  }

  async function retryManual(): Promise<MapPreviewPrepareResult & { attempt: number }> {
    refreshRetried = false;
    failed = false;
    manualAttempt += 1;
    const prepared = await prepare();
    return { ...prepared, attempt: manualAttempt };
  }

  function resetCycle() {
    refreshRetried = false;
    failed = false;
  }

  return {
    prepare,
    onImageError,
    retryManual,
    resetCycle,
    get hasFailed() {
      return failed;
    },
    get hasRetriedRefresh() {
      return refreshRetried;
    },
    get manualAttempt() {
      return manualAttempt;
    },
  };
}
