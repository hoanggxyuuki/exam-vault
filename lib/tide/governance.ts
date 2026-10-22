import { IAMService } from "@tidecloak/js";
import rawConfig from "../../tidecloak.json";

const tcConfig = rawConfig as unknown as Record<string, string>;
const KC = String(tcConfig["auth-server-url"] ?? "").replace(/\/$/, "");
const REALM = String(tcConfig["realm"] ?? "");
const ADMIN = `${KC}/admin/realms/${REALM}`;

export const DECRYPT_ROLE = "_tide_decryptor";
export const BOARD_ROLE = "tide-realm-admin";

export interface ChangeRequest {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
  requestedBy?: string;
  createdAt?: number;
  resolvedAt?: number;
  resolvedBy?: string;
  rows?: unknown;
  authorizationCount?: number;
  authorizers?: { username: string; timestamp?: number }[];
  threshold?: number;
  readyToCommit?: boolean;
}

interface ApproveReply {
  mode: "recorded" | "needs-approval";
  committed?: boolean;
  authCount?: number;
  threshold?: number;
  requestModel?: string;
  status?: string;
}

interface TideClient {
  requestTideOperatorApproval(
    requests: { id: string; request: Uint8Array }[],
  ): Promise<{ id: string; request: Uint8Array; status: "approved" | "denied" | "pending" }[]>;
}

function tc(): TideClient {
  const client = (IAMService as unknown as { _tc: TideClient | null })._tc;
  if (!client) throw new Error("TideCloak is not initialised");
  return client;
}

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function kc(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return IAMService.secureFetch(`${ADMIN}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function json<T>(token: string, path: string): Promise<T> {
  const res = await kc(token, path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await readError(res)}`);
  return res.json();
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j.errorMessage || j.error_description || j.error || j.detail || text || res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export async function listChangeRequests(token: string, status = "PENDING"): Promise<ChangeRequest[]> {
  return json(token, `/iga/change-requests?status=${status}`);
}

export async function findUserId(token: string, username: string): Promise<string> {
  const [u] = await json<{ id: string }[]>(token, `/users?username=${encodeURIComponent(username)}&exact=true`);
  if (!u?.id) throw new Error(`No user called ${username}`);
  return u.id;
}

async function realmManagementId(token: string): Promise<string> {
  const [rm] = await json<{ id: string }[]>(token, `/clients?clientId=realm-management`);
  if (!rm?.id) throw new Error("realm-management client not found");
  return rm.id;
}

export async function requestRealmRole(token: string, username: string, role: string, revoke = false): Promise<void> {
  const uid = await findUserId(token, username);
  const rep = await json<unknown>(token, `/roles/${encodeURIComponent(role)}`);
  const res = await kc(token, `/users/${uid}/role-mappings/realm`, { method: revoke ? "DELETE" : "POST", body: JSON.stringify([rep]) });
  if (!res.ok) throw new Error(`${revoke ? "Revoke" : "Grant"} ${role} for ${username}: HTTP ${res.status} ${await readError(res)}`);
}

export async function requestBoardSeat(token: string, username: string): Promise<void> {
  const uid = await findUserId(token, username);
  const rm = await realmManagementId(token);
  const rep = await json<unknown>(token, `/clients/${rm}/roles/${BOARD_ROLE}`);
  const res = await kc(token, `/users/${uid}/role-mappings/clients/${rm}`, { method: "POST", body: JSON.stringify([rep]) });
  if (!res.ok) throw new Error(`Board seat for ${username}: HTTP ${res.status} ${await readError(res)}`);
}

export async function approveChangeRequest(token: string, id: string): Promise<ApproveReply> {
  const first = await kc(token, `/iga/change-requests/${id}/approve`, { method: "POST", body: "{}" });
  if (!first.ok) throw new Error(`Approve: HTTP ${first.status} ${await readError(first)}`);
  const reply: ApproveReply = await first.json();
  if (reply.mode !== "needs-approval" || !reply.requestModel) return reply;

  const [signed] = await tc().requestTideOperatorApproval([{ id, request: fromBase64(reply.requestModel) }]);
  if (!signed || signed.status !== "approved") throw new Error(`The Tide window did not approve (${signed?.status ?? "closed"})`);

  const second = await kc(token, `/iga/change-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ requestModel: toBase64(signed.request) }),
  });
  if (!second.ok) throw new Error(`Approve: HTTP ${second.status} ${await readError(second)}`);
  return second.json();
}

export async function denyChangeRequest(token: string, id: string, reason: string): Promise<void> {
  const res = await kc(token, `/iga/change-requests/${id}/deny`, { method: "POST", body: JSON.stringify({ reason }) });
  if (!res.ok) throw new Error(`Deny: HTTP ${res.status} ${await readError(res)}`);
}

export async function fetchAdminPolicy(token: string): Promise<Uint8Array> {
  const body = await json<{ policy?: string }>(token, `/iga/role-policies/name/${BOARD_ROLE}`);
  if (!body?.policy) throw new Error("The board's admin policy was not found");
  return fromBase64(body.policy);
}

export interface Directory {
  users: Record<string, string>;
  roles: Record<string, string>;
  board: string[];
  keyHolders: string[];
}

export async function loadDirectory(token: string): Promise<Directory> {
  const rm = await realmManagementId(token);
  const [users, roles, clientRoles, board, holders] = await Promise.all([
    json<{ id: string; username: string }[]>(token, `/users?briefRepresentation=true&max=200`),
    json<{ id: string; name: string }[]>(token, `/roles?briefRepresentation=true&max=200`),
    json<{ id: string; name: string }[]>(token, `/clients/${rm}/roles?briefRepresentation=true`),
    json<{ username: string }[]>(token, `/clients/${rm}/roles/${BOARD_ROLE}/users?max=50`),
    json<{ username: string }[]>(token, `/roles/${DECRYPT_ROLE}/users?max=50`),
  ]);
  const dir: Directory = { users: {}, roles: {}, board: board.map((u) => u.username), keyHolders: holders.map((u) => u.username) };
  for (const u of users) dir.users[u.id] = u.username;
  for (const r of [...roles, ...clientRoles]) dir.roles[r.id] = r.name;
  return dir;
}

interface CrRow { USER_ID?: string; ROLE_ID?: string }

export function changeRequestTarget(cr: ChangeRequest, dir?: Directory): { role?: string; user?: string } {
  const rows = (Array.isArray(cr.rows) ? cr.rows : []) as CrRow[];
  const row = rows[0] ?? {};
  return {
    role: row.ROLE_ID ? dir?.roles[row.ROLE_ID] ?? row.ROLE_ID.slice(0, 8) : undefined,
    user: row.USER_ID ? dir?.users[row.USER_ID] ?? row.USER_ID.slice(0, 8) : undefined,
  };
}

export function describeChangeRequest(cr: ChangeRequest, dir?: Directory, nameOf: (u: string) => string = (u) => u): string {
  const { role, user } = changeRequestTarget(cr, dir);
  const who = user ? nameOf(user) : "someone";
  const what = role === DECRYPT_ROLE ? "the opening key" : role === BOARD_ROLE ? "a seat on the exam board" : role ?? cr.entityType;
  if (cr.actionType === "GRANT_ROLES") return `Give ${who} ${what}`;
  if (cr.actionType === "REVOKE_ROLES") return `Take ${what} from ${who}`;
  if (cr.actionType === "REGEN_ADMIN_POLICY") return "Update the board's signing rule";
  return `${cr.actionType.toLowerCase().replace(/_/g, " ")} ${role ?? ""}`.trim();
}
