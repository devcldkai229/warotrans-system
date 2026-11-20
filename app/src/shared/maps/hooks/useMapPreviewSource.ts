import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAccessToken,
  getApiBaseUrl,
  getFreshAccessToken,
  onAccessTokenChange,
  tokenSecondsLeft,
} from '../../api/client';
import { isBackendMapAssetUri, resolveMapPreviewUri } from '../../utils/mapCoordinates';
import {
  createMapPreviewAuthController,
  shouldProactivelyRefreshMapToken,
} from '../mapPreviewAuth';

export interface MapPreviewSource {
  uri: string | null;
  hasPreviewAsset: boolean;
  imageAttempt: number;
  isLoading: boolean;
  hasError: boolean;
  onImageLoad: () => void;
  onImageError: () => void;
  retry: () => void;
}

export function useMapPreviewSource(
  mapId: string | undefined,
  previewImageUri: string | null | undefined,
  enabled = true,
): MapPreviewSource {
  const apiBaseUrl = getApiBaseUrl();
  const isBackendAsset = useMemo(
    () => isBackendMapAssetUri(previewImageUri, apiBaseUrl),
    [previewImageUri, apiBaseUrl],
  );
  const hasPreviewAsset = useMemo(
    () => Boolean(resolveMapPreviewUri(previewImageUri, apiBaseUrl, null)),
    [previewImageUri, apiBaseUrl],
  );

  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;
  const isBackendAssetRef = useRef(isBackendAsset);
  isBackendAssetRef.current = isBackendAsset;

  const [imageAttempt, setImageAttempt] = useState(0);
  const [imageLoadedKey, setImageLoadedKey] = useState('');
  const [imageFailedKey, setImageFailedKey] = useState('');
  const [authError, setAuthError] = useState(false);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  const controllerRef = useRef<ReturnType<typeof createMapPreviewAuthController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createMapPreviewAuthController({
      getToken: () => getAccessToken(),
      tokenSecondsLeft: (value) => tokenSecondsLeft(value),
      refreshToken: (minSeconds) => getFreshAccessToken(minSeconds),
      isBackendAsset: () => isBackendAssetRef.current,
    });
  }

  useEffect(() => {
    return onAccessTokenChange((nextToken) => {
      setToken(nextToken);
      if (nextToken) {
        setAuthError(false);
        setImageFailedKey('');
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    controllerRef.current?.resetCycle();
    setImageLoadedKey('');
    setImageFailedKey('');
    setAuthError(false);

    if (!enabled || !isBackendAsset) {
      setIsRefreshingToken(false);
      return;
    }

    const current = getAccessToken();
    if (!shouldProactivelyRefreshMapToken(current, tokenSecondsLeft(current))) {
      setIsRefreshingToken(false);
      return;
    }

    setIsRefreshingToken(true);
    void controllerRef.current?.prepare().then((result) => {
      if (cancelled) return;
      setToken(result.token);
      setAuthError(!result.ok);
      if (result.refreshed) {
        setImageAttempt((attempt) => attempt + 1);
      }
      setIsRefreshingToken(false);
    });

    return () => {
      cancelled = true;
    };
  }, [mapId, previewImageUri, enabled, isBackendAsset]);

  const resolvedUri = useMemo(
    () => (authError ? null : resolveMapPreviewUri(previewImageUri, apiBaseUrl, token)),
    [authError, previewImageUri, apiBaseUrl, token],
  );

  const imageKey = `${mapId ?? ''}:${resolvedUri ?? ''}:${imageAttempt}`;
  const imageKeyRef = useRef(imageKey);
  imageKeyRef.current = imageKey;

  const onImageLoad = useCallback(() => {
    setImageLoadedKey(imageKeyRef.current);
    setImageFailedKey('');
    setAuthError(false);
  }, []);

  const onImageError = useCallback(() => {
    const failedKey = imageKeyRef.current;
    const failedToken = tokenRef.current;
    if (!isBackendAssetRef.current) {
      setImageFailedKey(failedKey);
      return;
    }
    setIsRefreshingToken(true);
    void controllerRef.current?.onImageError(failedToken).then((result) => {
      setIsRefreshingToken(false);
      if (result.retried) {
        setToken(result.token);
        setAuthError(false);
        setImageFailedKey('');
        setImageAttempt((attempt) => attempt + 1);
      } else {
        setImageFailedKey(failedKey);
        if (!result.token) {
          setAuthError(true);
        }
      }
    });
  }, []);

  const retry = useCallback(() => {
    setImageFailedKey('');
    setAuthError(false);
    setIsRefreshingToken(isBackendAssetRef.current);
    void controllerRef.current?.retryManual().then((result) => {
      setIsRefreshingToken(false);
      setToken(result.token);
      setAuthError(!result.ok);
      setImageAttempt((attempt) => attempt + 1);
    });
  }, []);

  const hasError = enabled && (authError || !resolvedUri || imageFailedKey === imageKey);
  const isLoading =
    enabled &&
    !hasError &&
    (isRefreshingToken || (Boolean(resolvedUri) && imageLoadedKey !== imageKey));

  return {
    uri: resolvedUri,
    hasPreviewAsset,
    imageAttempt,
    isLoading,
    hasError,
    onImageLoad,
    onImageError,
    retry,
  };
}
