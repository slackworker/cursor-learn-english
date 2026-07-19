import type { ReactNode } from "react";

type PageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-base-content">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-xs leading-snug text-base-content/55">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </main>
  );
}
