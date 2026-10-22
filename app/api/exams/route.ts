import { NextRequest, NextResponse } from "next/server";
import { getCaller, unauthorized, forbidden } from "@/lib/server/auth";
import { readStore, updateStore, audit } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  const s = await readStore();
  return NextResponse.json(
    s.exams.map((e) => {
      const paper = s.papers.find((p) => p.examId === e.id);
      return {
        ...e,
        sealed: !!paper,
        sealedBy: paper?.sealedBy ?? null,
        sealedAt: paper?.sealedAt ?? null,
        hasWritePolicy: s.policies.some((p) => p.examId === e.id && p.access === "write"),
        hasReadPolicy: s.policies.some((p) => p.examId === e.id && p.access === "read"),
      };
    }),
  );
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  if (!caller.isBoard) return forbidden("Only the exam board can open an exam slot");
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim().toUpperCase();
  const title = String(body?.title ?? "").trim();
  const examAt = String(body?.examAt ?? "").trim();
  if (!/^[A-Z0-9]{3,12}$/.test(code) || !title || !examAt) {
    return NextResponse.json({ error: "code (3-12 letters/digits), title and examAt are required" }, { status: 400 });
  }
  const id = `exam-${code.toLowerCase()}-${Date.now().toString(36)}`;
  const exam = await updateStore((s) => {
    const e = { id, code, title, examAt, createdBy: caller.username, createdAt: new Date().toISOString() };
    s.exams.push(e);
    audit(s, caller.username, "open-slot", `${code} ${title}`, id);
    return e;
  });
  return NextResponse.json(exam, { status: 201 });
}
