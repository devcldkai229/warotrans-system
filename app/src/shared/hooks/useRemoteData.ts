import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { getSessionGeneration } from '../api/client';

export function useRemoteData<T>(loader: () => Promise<T>, dependencies: DependencyList = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const request = useRef(0);
  const mounted = useRef(false);
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const id = ++request.current;
    const generation = getSessionGeneration();
    setLoading(true);
    setError(null);
    const current = () => mounted.current && id === request.current && generation === getSessionGeneration();
    try {
      const result = await loaderRef.current();
      if (current()) setData(result);
    } catch (error) {
      if (current()) setError(error instanceof Error ? error.message : 'Request failed');
    } finally { if (current()) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    setData(undefined);
    void reload();
    return () => { mounted.current = false; ++request.current; };
  }, [reload, ...dependencies]);
  const applyData = useCallback((value: T) => {
    // A mutation response supersedes reads that began before the mutation completed.
    ++request.current;
    setData(value); setError(null); setLoading(false);
  }, []);
  return { data, setData: applyData, error, loading, reload };
}
