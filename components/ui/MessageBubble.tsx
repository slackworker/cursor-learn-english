import type { ReactNode } from "react";

type MessageBubbleProps = {
  variant: "user" | "assistant";
  label: string;
  children: ReactNode;
  action?: ReactNode;
};

const VARIANT_STYLES = {
  user: {
    bubble: "rounded-xl border border-info/30 bg-info/10 p-4",
    label: "text-xs font-medium text-info",
  },
  assistant: {
    bubble: "rounded-xl border border-success/30 bg-success/10 p-4",
    label: "text-xs font-medium text-success",
  },
} as const;

export function MessageBubble({ variant, label, children, action }: MessageBubbleProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className={styles.bubble}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className={styles.label}>{label}</span>
        {action}
      </div>
      <div className="text-base leading-relaxed">{children}</div>
    </div>
  );
}
