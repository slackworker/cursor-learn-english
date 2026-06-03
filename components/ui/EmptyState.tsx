import type { ReactNode } from "react";
import { Surface } from "./Surface";

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Surface className="empty-state" padding="lg">
      <p>{children}</p>
    </Surface>
  );
}

export function LoadingState({ children = "加载中…" }: { children?: ReactNode }) {
  return (
    <Surface className="loading-state" padding="lg">
      <span className="loading loading-spinner loading-sm" />
      <span>{children}</span>
    </Surface>
  );
}
