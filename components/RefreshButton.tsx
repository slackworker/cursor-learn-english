"use client";

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
      className={`btn btn-ghost btn-xs gap-1 ${className}`.trim()}
      onClick={() => onRefresh()}
      disabled={isValidating}
      aria-busy={isValidating}
      aria-label="刷新"
      title="刷新"
    >
      刷新
    </button>
  );
}
