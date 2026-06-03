import type { ReactNode } from "react";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  summary?: ReactNode;
};

export function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  disabled,
  summary,
}: PaginationProps) {
  return (
    <div className="pagination-bar">
      {summary ? <div className="pagination-summary">{summary}</div> : <span />}
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
