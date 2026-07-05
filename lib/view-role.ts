import { cookies } from "next/headers";
import type { Session } from "next-auth";

export const VIEW_MODE_COOKIE = "silhouette_view_mode";

export type EffectiveRole = "customer" | "admin";
export type ViewMode = "customer" | "admin";

export function isAdminSession(session: Session | null | undefined) {
  return session?.user?.role === "admin";
}

export function getViewMode(): ViewMode {
  const value = cookies().get(VIEW_MODE_COOKIE)?.value;
  return value === "customer" ? "customer" : "admin";
}

export function getEffectiveRole(session: Session | null | undefined): EffectiveRole {
  if (!isAdminSession(session)) return "customer";
  return getViewMode() === "customer" ? "customer" : "admin";
}

export function isEffectiveAdmin(session: Session | null | undefined) {
  return getEffectiveRole(session) === "admin";
}
