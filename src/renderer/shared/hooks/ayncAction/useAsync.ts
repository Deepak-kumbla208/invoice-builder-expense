import { useCallback, useEffect, useRef, useState } from 'react';

type AsyncFunction<T> = (...args: unknown[]) => Promise<T>;

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (...args: unknown[]) => void;
}

interface UseAsyncOptions {
  onLoadingChange?: (loading: boolean) => void;
  onError?: (error: Error) => void;
  immediate?: boolean;
}

export const useAsync = <T>(asyncFn: AsyncFunction<T>, options: UseAsyncOptions = {}): UseAsyncResult<T> => {
  const { onLoadingChange, onError, immediate = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);

  // Held in refs so `execute` only changes when `asyncFn` does: a caller whose
  // callbacks are rebuilt on every render must not re-trigger the immediate run.
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onErrorRef.current = onError;
  }, [onLoadingChange, onError]);

  const execute = useCallback(
    (...args: unknown[]) => {
      setLoading(true);
      onLoadingChangeRef.current?.(true);
      setError(null);

      asyncFn(...args)
        .then(response => {
          setData(response);
        })
        .catch(err => {
          const e = err as Error;
          setError(e);
          onErrorRef.current?.(e);
        })
        .finally(() => {
          setLoading(false);
          onLoadingChangeRef.current?.(false);
        });
    },
    [asyncFn]
  );

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { data, loading, error, execute };
};
