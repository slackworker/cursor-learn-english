import { PageShell } from "@/components/ui/PageShell";
import { DashboardHome } from "@/components/DashboardHome";

export default function Home() {
  return (
    <PageShell
      title="概览"
      description="今日用量、近期趋势与最近会话。需要明细时可进入各功能页。"
    >
      <DashboardHome />
    </PageShell>
  );
}
