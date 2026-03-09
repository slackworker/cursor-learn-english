import { SessionTable } from "@/components/SessionTable";

export default function SessionsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm opacity-60">
        由 sessionStart / sessionEnd 聚合的会话记录。
      </p>
      <SessionTable />
    </main>
  );
}
