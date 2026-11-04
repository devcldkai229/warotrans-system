/** Coalesce poll/push reads and discard results superseded by navigation or a command. */
export function createJobRefresh<T>() {
  let version = 0;
  let pending: { key: string; version: number; promise: Promise<T> } | null = null;
  return {
    get version() { return version; },
    invalidate() { version++; pending = null; },
    read(key: string, load: () => Promise<T>, apply: (result: T) => void, fail: (error: unknown) => void): Promise<T> {
      if (pending?.key === key && pending.version === version) return pending.promise;
      const requestVersion = ++version;
      const promise = Promise.resolve().then(load).then(result => {
        if (requestVersion === version) apply(result);
        return result;
      }, error => {
        if (requestVersion === version) fail(error);
        throw error;
      });
      pending = { key, version: requestVersion, promise };
      const clear = () => { if (pending?.promise === promise) pending = null; };
      void promise.then(clear, clear);
      return promise;
    },
  };
}
