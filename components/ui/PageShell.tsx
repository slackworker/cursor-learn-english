import type { ReactNode } from "react";

type PageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  compact?: boolean;
};

export function PageShell({ title, description, children, compact }: PageShellProps) {
  return (
    <main className="page-shell">
      <header className={compact ? "page-header page-header-compact" : "page-header"}>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </header>
      {children}
    </main>
  );
}
