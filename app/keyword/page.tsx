"use client";

import { useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { KeywordTable } from "@/components/KeywordTable";

export default function KeywordPage() {
  const [selectedDate, setSelectedDate] = useState("");

  return (
    <PageShell title="关键词分析">
      <div className="toolbar mb-6">
        <label className="form-control">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/45">日期</span>
          <input
            type="date"
            className="input input-bordered input-sm bg-base-100"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm self-end"
          onClick={() => setSelectedDate("")}
        >
          清空日期
        </button>
      </div>
      <KeywordTable selectedDate={selectedDate} />
    </PageShell>
  );
}
