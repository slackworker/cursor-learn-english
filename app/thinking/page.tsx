import { ThinkingList } from "@/components/ThinkingList";

export default function ThinkingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm opacity-60">
        来自 afterAgentThought 的推理文本，需使用带 thinking 的模型（如 Claude Opus thinking）。
      </p>
      <ThinkingList />
    </main>
  );
}
