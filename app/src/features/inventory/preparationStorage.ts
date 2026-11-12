interface StorageAdapter { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> }
export interface PreparationScope { accountId: string; warehouseId: string; documentKey: string }

/** Chunked ASCII JSON keeps SecureStore entries small; the manifest commits only after all chunks exist. */
export function createPreparationStorage(adapter: StorageAdapter) {
  const queues = new Map<string, Promise<unknown>>();
  let sequence = 0;
  const keyFor = (scope: PreparationScope) => 'voucher-prep.' + [scope.accountId, scope.warehouseId, scope.documentKey].map(value => value.split('').map(char => char.charCodeAt(0).toString(16)).join('-')).join('.');
  const validManifest = (value: { version?: number; count?: number; revision?: string } | null): value is { version: 1; count: number; revision: string } =>
    !!value && value.version === 1 && Number.isInteger(value.count) && value.count! >= 1 && value.count! <= 10000 && typeof value.revision === 'string' && /^[a-z0-9]+-[a-z0-9]+$/.test(value.revision);
  function enqueue<T>(key: string, action: () => Promise<T>): Promise<T> {
    const job = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
    queues.set(key, job);
    void job.finally(() => { if (queues.get(key) === job) queues.delete(key); }).catch(() => {});
    return job;
  }
  function read(scope: PreparationScope): Promise<unknown | null> {
    const key = keyFor(scope);
    // Serialize reads as well, so cleanup cannot delete a revision being read.
    return enqueue(key, async () => {
      const raw = await adapter.get(key);
      if (!raw) return null;
      const manifest = JSON.parse(raw);
      if (!validManifest(manifest)) throw new Error('Preparation could not be read.');
      const chunks: string[] = [];
      for (let i = 0; i < manifest.count; i++) {
        const chunk = await adapter.get(`${key}.${manifest.revision}.${i}`);
        if (chunk === null) throw new Error('Preparation is incomplete.');
        chunks.push(chunk);
      }
      const record = JSON.parse(chunks.join(''));
      if (!record.scope || record.scope.accountId !== scope.accountId || record.scope.warehouseId !== scope.warehouseId || record.scope.documentKey !== scope.documentKey) throw new Error('Preparation belongs to another account or warehouse.');
      return record.value;
    });
  }
  function write(scope: PreparationScope, value: unknown) {
    const key = keyFor(scope);
    const serialized = JSON.stringify({ scope, value }).replace(/[\u007f-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
    return enqueue(key, async () => {
      const previous = await adapter.get(key);
      const revision = Date.now().toString(36) + '-' + (++sequence).toString(36);
      const count = Math.ceil(serialized.length / 1800);
      if (count > 10000) throw new Error('Preparation exceeds device storage limits.');
      let written = 0;
      try {
        for (let i = 0; i < count; i++) { await adapter.set(`${key}.${revision}.${i}`, serialized.slice(i * 1800, (i + 1) * 1800)); written++; }
        await adapter.set(key, JSON.stringify({ version: 1, revision, count }));
      } catch (error) {
        for (let i = 0; i < written; i++) { try { await adapter.remove(`${key}.${revision}.${i}`); } catch { /* Retry can still read the previous committed revision. */ } }
        throw error;
      }
      if (previous) {
        try {
          const old = JSON.parse(previous);
          if (validManifest(old)) for (let i = 0; i < old.count; i++) await adapter.remove(`${key}.${old.revision}.${i}`);
        } catch { /* A cleanup failure must not turn a committed local save into a failed save. */ }
      }
    });
  }
  return { read, write };
}
