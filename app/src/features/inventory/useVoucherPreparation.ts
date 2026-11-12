import { useCallback, useEffect, useRef, useState } from 'react';
import { preparationDeviceStore } from './preparationDeviceStore';
import { emptyPreparation, validPreparation, type VoucherPreparation } from './voucherPreparation';
import type { StockVoucherType } from '../../shared/types/contracts';

/** Local preparation has its own account/warehouse/document scope, never a server sync queue. */
export function useVoucherPreparation(accountId: string, warehouseId: string, documentKey: string, type: StockVoucherType) {
  const [value, setValue] = useState<VoucherPreparation>(() => emptyPreparation(type));
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const identity = JSON.stringify([accountId, warehouseId, documentKey, type]);
  const latestIdentity = useRef(identity); latestIdentity.current = identity;
  const scope = { accountId, warehouseId, documentKey };
  // A separate mutable slot per loaded scope lets cleanup flush its own inputs,
  // even if the next render already belongs to a different login or warehouse.
  const slot = useRef<{ identity: string; value: VoucherPreparation } | null>(null);
  if (loadedIdentity === identity && slot.current?.identity === identity) slot.current.value = value;
  const ready = loadedIdentity === identity;
  useEffect(() => {
    let cancelled = false;
    setLoadedIdentity(''); setSaved(false); setError(null);
    if (!accountId || !warehouseId) return;
    void preparationDeviceStore.read(scope).then(stored => {
      if (cancelled) return;
      if (stored !== null && !validPreparation(stored, type)) throw new Error('Invalid preparation');
      const item = (stored as VoucherPreparation | null) || emptyPreparation(type);
      slot.current = { identity, value: item };
      setValue(item); setLoadedIdentity(identity); setSaved(stored !== null);
    }).catch(() => { if (!cancelled) setError('Saved preparation could not be loaded. Retry to keep your previous inputs.'); });
    return () => { cancelled = true; };
  }, [identity, attempt]);
  useEffect(() => {
    if (!ready) return;
    const ownSlot = slot.current!;
    return () => { void preparationDeviceStore.write(scope, ownSlot.value).catch(() => {}); };
  }, [identity, ready]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void preparationDeviceStore.write(scope, value).then(() => {
        if (latestIdentity.current === identity && slot.current?.value === value) { setSaved(true); setError(null); }
      }).catch(() => { if (latestIdentity.current === identity) setError('Preparation could not be saved on this device. Keep this screen open and retry.'); });
    }, 400);
    return () => clearTimeout(timer);
  }, [value, ready, identity]);
  const update = useCallback((apply: (previous: VoucherPreparation) => VoucherPreparation) => {
    if (loadedIdentity !== identity) return;
    setSaved(false); setValue(apply);
  }, [identity, loadedIdentity]);
  const persist = async () => {
    if (!ready || slot.current?.identity !== identity) throw new Error('Preparation is not ready.');
    const snapshot = slot.current.value;
    await preparationDeviceStore.write(scope, snapshot);
    if (latestIdentity.current === identity && slot.current?.value === snapshot) { setSaved(true); setError(null); }
  };
  return { value, update, ready, saved, error, persist, scope, retry: () => setAttempt(value => value + 1) };
}
