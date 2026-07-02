/**
 * QueryClient infrastructure for TanStack Query
 *
 * SSR-safe pattern:
 * - Server: fresh QueryClient per request
 * - Client: stable singleton across renders
 */

import { QueryClient, QueryClientProvider as Provider } from "@tanstack/react-query";
import type { ReactNode } from "react";

let clientSingleton: QueryClient | undefined;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,              // 30s — avoid refetch on every mount
        gcTime: 5 * 60_000,             // 5min — keep cache for navigation
        retry: 1,                       // retry once on failure
        refetchOnWindowFocus: false,    // don't refetch on tab switch
        refetchOnReconnect: false,      // don't refetch on network reconnect
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: always fresh (avoid data sharing between requests)
    return makeQueryClient();
  }
  // Client: stable singleton
  if (!clientSingleton) clientSingleton = makeQueryClient();
  return clientSingleton;
}

export function QueryClientProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return <Provider client={queryClient}>{children}</Provider>;
}
