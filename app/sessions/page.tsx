import { PageShell } from "@/components/ui/PageShell";
import { SessionTable } from "@/components/SessionTable";

export default function SessionsPage() {
  return (
    <PageShell
      title="会话记录"
      description="由 sessionStart / sessionEnd 聚合的 Cursor 会话列表。"
    >
      <SessionTable />
    </PageShell>
  );
}
