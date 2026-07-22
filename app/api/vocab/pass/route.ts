import { NextRequest } from "next/server";
import {
  migrateVocabPassed,
  passVocabItem,
  readVocabPassed,
  undoVocabPass,
  unpassVocabItem,
} from "@/lib/vocab-pass-store";
import type { VocabPassKind } from "@/lib/vocab-pass";

function isKind(value: unknown): value is VocabPassKind {
  return value === "words" || value === "phrases";
}

export async function GET() {
  return Response.json(readVocabPassed());
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected object body" }, { status: 400 });
  }

  const action = (body as { action?: unknown }).action;
  if (typeof action !== "string") {
    return Response.json({ error: "Missing action" }, { status: 400 });
  }

  if (action === "migrate") {
    const words = (body as { words?: unknown }).words;
    const phrases = (body as { phrases?: unknown }).phrases;
    const state = migrateVocabPassed(
      Array.isArray(words) ? (words as string[]) : [],
      Array.isArray(phrases) ? (phrases as string[]) : []
    );
    return Response.json(state);
  }

  const kind = (body as { kind?: unknown }).kind;
  if (!isKind(kind)) {
    return Response.json(
      { error: 'kind must be "words" or "phrases"' },
      { status: 400 }
    );
  }

  if (action === "pass" || action === "unpass") {
    const item = (body as { item?: unknown }).item;
    if (typeof item !== "string" || !item.trim()) {
      return Response.json({ error: "Missing item" }, { status: 400 });
    }
    const state =
      action === "pass"
        ? passVocabItem(kind, item)
        : unpassVocabItem(kind, item);
    return Response.json(state);
  }

  if (action === "undo") {
    const { state, undone } = undoVocabPass(kind);
    return Response.json({ ...state, undone });
  }

  return Response.json(
    { error: `Unknown action: ${action}` },
    { status: 400 }
  );
}
