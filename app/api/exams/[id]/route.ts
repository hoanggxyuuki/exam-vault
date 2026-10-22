import { NextRequest, NextResponse } from "next/server";
import { getCaller, unauthorized } from "@/lib/server/auth";
import { readStore, eventsFor } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const caller = await getCaller(req);
  if (!caller) return unauthorized();
  const { id } = await params;
  const s = await readStore();
  const exam = s.exams.find((e) => e.id === id);
  if (!exam) return NextResponse.json({ error: "No such exam" }, { status: 404 });
  return NextResponse.json({
    exam,
    paper: s.papers.find((p) => p.examId === id) ?? null,
    policies: s.policies
      .filter((p) => p.examId === id)
      .map(({ access, subjectType, subjectId, grantedBy, createdAt, policy }) => ({ access, subjectType, subjectId, grantedBy, createdAt, policy })),
    events: eventsFor(s, exam),
  });
}
