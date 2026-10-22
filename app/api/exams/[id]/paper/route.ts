import { NextRequest, NextResponse } from "next/server";
import { getCaller, unauthorized, forbidden } from "@/lib/server/auth";
import { readStore, updateStore, audit } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  const { id } = await params;
  const s = await readStore();
  const paper = s.papers.find((p) => p.examId === id);
  if (!paper) return NextResponse.json({ error: "Paper not sealed yet" }, { status: 404 });
  return NextResponse.json(paper);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  if (!caller.realmRoles.includes("lecturer")) return forbidden("Only a lecturer can seal a paper");
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const ciphertext = typeof body?.ciphertext === "string" ? body.ciphertext : "";
  if (!ciphertext || ciphertext.length > 2_000_000) return NextResponse.json({ error: "ciphertext required" }, { status: 400 });
  const result = await updateStore((s) => {
    if (!s.exams.some((e) => e.id === id)) return "missing" as const;
    if (s.papers.some((p) => p.examId === id)) return "sealed" as const;
    s.papers.push({ examId: id, ciphertext, sealedBy: caller.username, sealedAt: new Date().toISOString() });
    audit(s, caller.username, "seal", id, id);
    return "ok" as const;
  });
  if (result === "missing") return NextResponse.json({ error: "No such exam" }, { status: 404 });
  if (result === "sealed") return NextResponse.json({ error: "Paper already sealed" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
