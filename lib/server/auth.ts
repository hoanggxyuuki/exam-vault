import { NextRequest, NextResponse } from "next/server";
import { verifyTideCloakToken } from "@tidecloak/nextjs/server";
import rawConfig from "../../tidecloak.json";

const tcConfig = rawConfig as Record<string, unknown>;

export interface Caller {
  username: string;
  tideUserKey: string;
  realmRoles: string[];
  isBoard: boolean;
}

export async function getCaller(req: NextRequest): Promise<Caller | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const payload = (await verifyTideCloakToken(tcConfig, auth.slice(7), [])) as Record<string, any> | null;
  if (!payload) return null;
  const realmRoles: string[] = payload.realm_access?.roles ?? [];
  const mgmtRoles: string[] = payload.resource_access?.["realm-management"]?.roles ?? [];
  return {
    username: String(payload.preferred_username ?? ""),
    tideUserKey: String(payload.tideuserkey ?? ""),
    realmRoles,
    isBoard: mgmtRoles.includes("tide-realm-admin"),
  };
}

export const unauthorized = () => NextResponse.json({ error: "Sign in first" }, { status: 401 });
export const forbidden = (why: string) => NextResponse.json({ error: why }, { status: 403 });
