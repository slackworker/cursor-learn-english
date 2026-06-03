import { PageShell } from "@/components/ui/PageShell";
import { DashboardHome } from "@/components/DashboardHome";

export default function Home() {
  return (
    <PageShell title="概览">
      <DashboardHome />
    </PageShell>
  );
}
