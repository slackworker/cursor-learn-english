"use client";

import { RefreshCw } from "lucide-react";

type RefreshButtonProps = {
  onRefresh: () => void;
  isValidating?: boolean;
  className?: string;
};

export function RefreshButton({
  onRefresh,
  isValidating = false,
  className = "",
}: RefreshButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-square btn-xs ${className}`.trim()}
      onClick={() => onRefresh()}
      disabled={isValidating}
      aria-busy={isValidating}
      aria-label="刷新"
      title="刷新"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`}
        aria-hidden
      />
    </button>
  );
}
