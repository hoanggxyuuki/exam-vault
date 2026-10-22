import { NextRequest, NextResponse } from "next/server";
import { getCaller, unauthorized, forbidden } from "@/lib/server/auth";
import { readStore, updateStore, audit } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  const examId = req.nextUrl.searchParams.get("examId") ?? "";
  const access = req.nextUrl.searchParams.get("access") ?? "";
  const s = await readStore();
  const p = s.policies.find((x) => x.examId === examId && x.access === access);
  if (!p) return NextResponse.json({ error: "No policy for this exam yet" }, { status: 404 });
  return NextResponse.json({ policy: p.policy, subjectId: p.subjectId });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  if (!caller.isBoard) return forbidden("Only the exam board can store exam policies");
  const body = await req.json().catch(() => null);
  const examId = String(body?.examId ?? "");
  const access = body?.access === "read" || body?.access === "write" ? body.access : null;
  const policy = typeof body?.policy === "string" ? body.policy : "";
  const subjectId = access === "write" ? "lecturer" : "invigilator";
  if (!access || !policy || !/^[A-Za-z0-9+/=]+$/.test(policy)) return NextResponse.json({ error: "examId, access and policy required" }, { status: 400 });
  const ok = await updateStore((s) => {
    if (!s.exams.some((e) => e.id === examId)) return false;
    s.policies = s.policies.filter((p) => !(p.examId === examId && p.access === access));
    s.policies.push({ examId, access, subjectType: "Role", subjectId, policy, grantedBy: caller.username, createdAt: new Date().toISOString() });
    audit(s, caller.username, "store-policy", `${examId} ${access} -> role:${subjectId}`, examId);
    return true;
  });
  if (!ok) return NextResponse.json({ error: "No such exam" }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
