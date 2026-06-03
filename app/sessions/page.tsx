import { PageShell } from "@/components/ui/PageShell";
import { SessionTable } from "@/components/SessionTable";

export default function SessionsPage() {
  return (
    <PageShell title="会话列表">
      <SessionTable />
    </PageShell>
  );
}
