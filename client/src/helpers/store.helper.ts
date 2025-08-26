import type { UseMutationOptions, UseQueryOptions, QueryKey } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { axiosClient } from '../lib/axios-client';
import { removeObjectProps } from './global.helper';

export function useBaseMutation<TRes = unknown, TError = unknown, TData = unknown, TContext = unknown>(
  url: string,
  method: 'post' | 'put' | 'delete',
) {
  return (useMutationOptions: Omit<UseMutationOptions<TRes, TError, TData, TContext>, 'mutationFn'> = {}) =>
    useMutation<TRes, TError, TData, TContext>(
      async (data) => {
        const endpoint = url + ((data as TData & { url?: string })?.url || '');
        const payload = removeObjectProps(data as { [k: string]: unknown }, ['url']);
        switch (method) {
          case 'post':
            return (await axiosClient.post(endpoint, payload)).data;
          case 'put':
            return (await axiosClient.put(endpoint, payload)).data;
          case 'delete':
            return (await axiosClient.delete(endpoint, { data: payload })).data;
          default:
            throw new Error(`Unsupported method: ${method}`);
        }
      },
      useMutationOptions,
    );
}

export function useBaseQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(url: string) {
  return (useQueryOptions: Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'queryFn'> = {}) =>
    useQuery<TQueryFnData, TError, TData, TQueryKey>({
      ...useQueryOptions,
      queryFn: async () => (await axiosClient.get(url)).data,
    });
}
