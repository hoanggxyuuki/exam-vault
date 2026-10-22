import { promises as fs } from "fs";
import path from "path";

export interface Exam {
  id: string;
  code: string;
  title: string;
  examAt: string;
  createdBy: string;
  createdAt: string;
}

export interface Paper {
  examId: string;
  ciphertext: string;
  sealedBy: string;
  sealedAt: string;
}

export interface StoredPolicy {
  examId: string;
  access: "read" | "write";
  subjectType: "Role";
  subjectId: string;
  policy: string;
  grantedBy: string;
  createdAt: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
  examId?: string;
}

export interface Store {
  exams: Exam[];
  papers: Paper[];
  policies: StoredPolicy[];
  audit: AuditEntry[];
}

const FILE = path.join(process.cwd(), "data", "store.json");
const EMPTY: Store = { exams: [], papers: [], policies: [], audit: [] };

let queue: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<Store> {
  try {
    return { ...EMPTY, ...JSON.parse(await fs.readFile(FILE, "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function updateStore<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const s = await readStore();
    const out = await fn(s);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(s, null, 2));
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function audit(s: Store, actor: string, action: string, detail: string, examId?: string) {
  s.audit.unshift({ at: new Date().toISOString(), actor, action, detail, ...(examId ? { examId } : {}) });
  s.audit = s.audit.slice(0, 500);
}

export function eventsFor(s: Store, exam: Exam): AuditEntry[] {
  return s.audit
    .filter((a) => a.examId === exam.id || a.detail === exam.id || a.detail.startsWith(`${exam.id} `) || (a.action === "open-slot" && a.detail.startsWith(`${exam.code} `)))
    .slice()
    .reverse();
}
