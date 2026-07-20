import type { SessionSubagentLink } from "./sessions";

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** True when a clipped session title matches a Task description. */
export function titleMatchesTaskDescription(
  title: string | undefined,
  description: string
): boolean {
  if (!title) return false;
  const t = title.trim();
  const d = description.trim();
  if (!t || !d) return false;
  if (t === d) return true;
  if (t.endsWith("…") || t.endsWith("...")) {
    const stem = t.replace(/…$/, "").replace(/\.\.\.$/, "");
    return stem.length > 0 && d.startsWith(stem);
  }
  return false;
}

function taskAgentId(input: Record<string, unknown>): string | undefined {
  return (
    asNonEmptyString(input.agentId) ??
    asNonEmptyString(input.resume) ??
    asNonEmptyString(input.agent_id)
  );
}

function matchesDescription(
  link: SessionSubagentLink,
  description: string
): boolean {
  if (link.task_description && link.task_description === description) {
    return true;
  }
  if (titleMatchesTaskDescription(link.title, description)) return true;
  if (titleMatchesTaskDescription(link.task_description, description)) {
    return true;
  }
  return false;
}

/**
 * Map a Task tool_use input to a child subagent session.
 * Prefers agentId/resume, then Task `description` ↔ subagent title/description.
 */
export function resolveTaskSubagent(
  input: Record<string, unknown>,
  subagents: SessionSubagentLink[]
): SessionSubagentLink | undefined {
  if (subagents.length === 0) return undefined;

  const agentId = taskAgentId(input);
  if (agentId) {
    const byId = subagents.find((s) => s.session_id === agentId);
    if (byId) return byId;
  }

  const description = asNonEmptyString(input.description);
  if (!description) return undefined;

  return subagents.find((s) => matchesDescription(s, description));
}
