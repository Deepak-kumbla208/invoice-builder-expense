import { useCallback } from 'react';
import type { RequestHook } from '../../types/requestHook';
import type { Response } from '../../types/response';
import { useAsyncAction } from './useAsyncAction';

export const useApiQuery = <T>(
  fetcher: () => Promise<Response<T>>,
  { immediate = true, showLoader = true, onDone }: RequestHook<Response<T>> = {}
) => {
  const { data, loading, execute } = useAsyncAction<Response<T>>(fetcher, { immediate, showLoader, onDone });
  return { data: data?.success ? data.data : undefined, response: data, loading, execute };
};

interface MutationArgs<TInput, TOutput> {
  item?: TInput;
  immediate?: boolean;
  onDone?: (data: Response<TOutput>) => void;
}

export const useApiMutation = <TInput, TOutput>(
  call: (input: TInput) => Promise<Response<TOutput>>,
  { item, immediate = false, onDone }: MutationArgs<TInput, TOutput>
) => {
  const asyncFn = useCallback(
    async (): Promise<Response<TOutput>> => (item === undefined ? { success: false } : call(item)),
    [call, item]
  );
  const { data, execute } = useAsyncAction<Response<TOutput>>(asyncFn, { immediate, onDone });
  return { data: data?.success ? data.data : undefined, execute };
};
