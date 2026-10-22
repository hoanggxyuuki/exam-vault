import { NextRequest, NextResponse } from "next/server";
import { getCaller, unauthorized } from "@/lib/server/auth";
import { updateStore, audit } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const KINDS = new Set(["open-refused", "opened", "request-release", "request-self", "request-revoke"]);

export async function POST(req: NextRequest, { params }: Ctx) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const kind = String(body?.kind ?? "");
  const detail = String(body?.detail ?? "").slice(0, 240);
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Unknown event kind" }, { status: 400 });
  const ok = await updateStore((s) => {
    if (!s.exams.some((e) => e.id === id)) return false;
    audit(s, caller.username, kind, detail, id);
    return true;
  });
  if (!ok) return NextResponse.json({ error: "No such exam" }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
