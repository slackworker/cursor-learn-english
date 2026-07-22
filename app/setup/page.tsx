import { PageShell } from "@/components/ui/PageShell";
import { AppearanceSettingsPanel } from "@/components/AppearanceSettingsPanel";
import { SetupPanel } from "@/components/SetupPanel";
import { TtsSettingsPanel } from "@/components/TtsSettingsPanel";

export default function SetupPage() {
  return (
    <PageShell
      title="配置"
      description="调整外观与朗读等应用偏好，并检查本机 / WSL / Windows Hooks 是否指向同一数据目录。"
    >
      <div className="space-y-6">
        <section>
          <h2 className="section-title">外观</h2>
          <p className="mb-3 text-xs leading-relaxed text-base-content/50">
            主题与界面字号会保存在本机。
          </p>
          <AppearanceSettingsPanel />
        </section>
        <section>
          <h2 className="section-title">朗读设置</h2>
          <p className="mb-3 text-xs leading-relaxed text-base-content/50">
            使用浏览器语音合成，调整语言、音色与语速。
          </p>
          <TtsSettingsPanel />
        </section>
        <SetupPanel />
      </div>
    </PageShell>
  );
}
