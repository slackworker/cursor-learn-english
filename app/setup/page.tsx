import { PageShell } from "@/components/ui/PageShell";
import { SetupPanel } from "@/components/SetupPanel";

export default function SetupPage() {
  return (
    <PageShell
      title="环境配置"
      description="检查本机 / WSL / Windows Hooks 是否指向同一数据目录，并给出可复制的安装命令。"
    >
      <SetupPanel />
    </PageShell>
  );
}
