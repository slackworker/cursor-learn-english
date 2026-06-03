import { PageShell } from "@/components/ui/PageShell";
import { HomeSections } from "@/components/HomeSections";

export default function StatsPage() {
  return (
    <PageShell
      title="统计"
      description="按日/周查看完整指标与 14 天趋势。日常速览请用首页；上下文 token 为 preCompact 近似值。"
    >
      <HomeSections />
    </PageShell>
  );
}
