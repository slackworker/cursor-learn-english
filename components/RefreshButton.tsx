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
      aria-label="刷新"
      title="刷新"
    >
      {isValidating ? "刷新中…" : "刷新"}
    </button>
  );
}
