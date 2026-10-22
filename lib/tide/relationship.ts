import { IAMService } from "@tidecloak/js";
import { Models } from "@tideorg/js";
import { PolicySignRequest } from "heimdall-tide";

export const RELATIONSHIP_CONTRACT_ID = "RelationshipAttestation:1";
export const RELATIONSHIP_MODEL_IDS = ["PolicyEnabledEncryption:1", "PolicyEnabledDecryption:1"];
export const ENCRYPT_ROLE = "_tide_encryptor";
export const DECRYPT_ROLE = "_tide_decryptor";

export type RelationshipSubject =
  | { type: "User"; id: string }
  | { type: "Group"; id: string }
  | { type: "Role"; id: string; clientId?: string };

export type RelationshipAccess = "read" | "write" | "read-write";
const ROLES_FOR: Record<RelationshipAccess, string[]> = {
  read: [DECRYPT_ROLE],
  write: [ENCRYPT_ROLE],
  "read-write": [ENCRYPT_ROLE, DECRYPT_ROLE],
};
const SIGN_REQUEST_EXPIRY_SECONDS = 604800;

interface TideClient {
  dokenParsed?: Record<string, unknown>;
  createTideRequest(encodedRequest: Uint8Array): Promise<Uint8Array>;
  requestTideOperatorApproval(
    requests: { id: string; request: Uint8Array }[],
  ): Promise<{ id: string; request: Uint8Array; status: "approved" | "denied" | "pending" }[]>;
  executeSignRequest(request: Uint8Array, waitForAll?: boolean): Promise<Uint8Array[]>;
}

function tc(): TideClient {
  const client = (IAMService as unknown as { _tc: TideClient | null })._tc;
  if (!client) throw new Error("TideCloak is not initialised: call IAMService.initIAM first");
  return client;
}

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface RelationshipSession {
  tideUserKey: string;
  realmRoles: string[];
  groups: string[];
  canEncrypt: boolean;
  canDecrypt: boolean;
}

export function readSession(): RelationshipSession {
  const doken = tc().dokenParsed ?? {};
  const key = doken["tideuserkey"];
  const realmAccess = doken["realm_access"] as { roles?: unknown } | undefined;
  const realmRoles = Array.isArray(realmAccess?.roles) ? (realmAccess!.roles as unknown[]).map(String) : [];
  const groups = Array.isArray(doken["groups"]) ? (doken["groups"] as unknown[]).map(String) : [];
  return { tideUserKey: typeof key === "string" ? key : "", realmRoles, groups, canEncrypt: realmRoles.includes(ENCRYPT_ROLE), canDecrypt: realmRoles.includes(DECRYPT_ROLE) };
}

export interface RelationshipGrant {
  vendorId: string;
  subject: RelationshipSubject;
  recordId: string;
  access: RelationshipAccess;
  expiry?: number;
}

export function buildRelationshipPolicy(grant: RelationshipGrant) {
  const subject = grant.subject;
  if (!subject || !["User", "Group", "Role"].includes(subject.type)) throw new Error('subject.type must be "User", "Group" or "Role"');
  if (!subject.id) {
    throw new Error(subject.type === "User" ? "the grantee has no tideuserkey: they must sign in once first" : `subject.id (the ${subject.type.toLowerCase()}) is required`);
  }
  if (!grant.recordId) throw new Error("recordId is required");
  if (!ROLES_FOR[grant.access]) throw new Error('access must be "read", "write" or "read-write"');
  const version = (Models.Policy as unknown as { latestVersion: string }).latestVersion;
  return new Models.Policy({
    version,
    contractId: RELATIONSHIP_CONTRACT_ID,
    modelId: RELATIONSHIP_MODEL_IDS,
    keyId: grant.vendorId,
    approvalType: Models.ApprovalType.IMPLICIT,
    executionType: Models.ExecutionType.PRIVATE,
    params: new Map<string, string>([
      ["subjectType", subject.type],
      ["subjectId", subject.id],
      ...(subject.type === "Role" && subject.clientId ? ([["clientId", subject.clientId]] as [string, string][]) : []),
      ["assignmentId", grant.recordId],
      ["roles", JSON.stringify(ROLES_FOR[grant.access])],
    ]),
    ...(grant.expiry ? { expiry: grant.expiry } : {}),
  } as ConstructorParameters<typeof Models.Policy>[0]);
}

export async function signRelationshipPolicy(grant: RelationshipGrant, adminPolicy: Uint8Array): Promise<string> {
  const policy = buildRelationshipPolicy(grant);

  const request = PolicySignRequest.New(policy);
  request.setCustomExpiry(SIGN_REQUEST_EXPIRY_SECONDS);

  const initialised = await tc().createTideRequest(request.encode());
  const id = Models.BaseTideRequest.decode(initialised).getUniqueId();

  const [approval] = await tc().requestTideOperatorApproval([{ id, request: initialised }]);
  if (!approval || approval.status !== "approved") {
    throw new Error(`the grant was not approved (${approval ? approval.status : "no response"})`);
  }

  const approved = Models.BaseTideRequest.decode(approval.request);
  approved.addPolicy(adminPolicy);

  const signatures = await tc().executeSignRequest(approved.encode(), true);
  if (!signatures?.[0]) throw new Error("the network returned no signature");

  policy.signature = signatures[0];
  return toBase64(policy.toBytes());
}

export async function encryptForRecord(data: string, recordId: string, signedPolicyB64: string): Promise<string> {
  const [out] = await IAMService.doEncrypt([{ data, tags: [recordId] }], fromBase64(signedPolicyB64));
  return typeof out === "string" ? out : toBase64(out);
}

export async function decryptForRecord(encrypted: string, recordId: string, signedPolicyB64: string): Promise<string> {
  const [out] = await IAMService.doDecrypt([{ encrypted, tags: [recordId] }], fromBase64(signedPolicyB64));
  return typeof out === "string" ? out : new TextDecoder().decode(out);
}

export function describeRelationshipPolicy(signedPolicyB64: string) {
  const p = Models.Policy.from(fromBase64(signedPolicyB64));
  const param = (k: string) => String(p.params.entries.get(k) ?? "");
  return {
    contractId: p.contractId,
    subjectType: param("subjectType"),
    subjectId: param("subjectId"),
    clientId: param("clientId"),
    recordId: param("assignmentId"),
    roles: param("roles"),
    signed: !!p.signature && p.signature.length > 0,
    isRelationshipPolicy: p.contractId === RELATIONSHIP_CONTRACT_ID,
  };
}
