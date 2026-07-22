import { NextResponse } from "next/server";
import { getSetupDiagnostics } from "@/lib/setup-diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const diagnostics = getSetupDiagnostics();
    return NextResponse.json(diagnostics);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
