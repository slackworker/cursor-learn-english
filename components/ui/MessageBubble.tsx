import type { ReactNode } from "react";

type MessageBubbleProps = {
  variant: "user" | "assistant";
  label: string;
  children: ReactNode;
  action?: ReactNode;
};

export function MessageBubble({ variant, label, children, action }: MessageBubbleProps) {
  return (
    <div className={`message-bubble message-bubble-${variant}`}>
      <div className="message-bubble-header">
        <span className="message-bubble-label">{label}</span>
        {action}
      </div>
      <div className="message-bubble-body">{children}</div>
    </div>
  );
}
