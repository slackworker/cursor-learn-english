import { PageShell } from "@/components/ui/PageShell";
import { SessionTable } from "@/components/SessionTable";

export default function SessionsPage() {
  return (
    <PageShell
      title="会话列表"
      description="按 Cursor 会话聚合，点击进入完整对话流。"
    >
      <SessionTable />
    </PageShell>
  );
}
