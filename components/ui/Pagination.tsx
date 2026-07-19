import type { ReactNode } from "react";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  summary?: ReactNode;
  className?: string;
};

export function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  disabled,
  summary,
  className = "",
}: PaginationProps) {
  return (
    <div className={`pagination-bar ${className}`.trim()}>
      {summary ? <div className="pagination-summary">{summary}</div> : null}
      <div className="pagination-controls">
        <button
          type="button"
          className="btn-pagination"
          onClick={onPrev}
          disabled={disabled || page <= 1}
        >
          上一页
        </button>
        <span className="pagination-indicator">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn-pagination"
          onClick={onNext}
          disabled={disabled || page >= totalPages}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
