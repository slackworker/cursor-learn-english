"use client";

import { SWRConfig } from "swr";
import { fetchJson } from "@/lib/fetch-json";

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: fetchJson,
        revalidateOnFocus: false,
        dedupingInterval: 5_000,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
