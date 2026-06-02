import { HomeSections } from "@/components/HomeSections";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm opacity-60">
        按日聚合：提问数、工具调用、会话数。上下文 token 为 preCompact 近似值。
      </p>
      <HomeSections />
    </main>
  );
}
