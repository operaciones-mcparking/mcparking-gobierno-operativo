import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const structurePermissions = {
  editMatrix: "structure.matrix.edit",
  exportExcel: "structure.export.excel",
  exportPdf: "structure.export.pdf",
  view: "structure.view",
} as const;

export type StructurePermission = (typeof structurePermissions)[keyof typeof structurePermissions];

export type CurrentAccessContext = {
  canAccessStructure: boolean;
  canEditMatrix: boolean;
  canExportExcel: boolean;
  canExportPdf: boolean;
  canNavigateProcesses: boolean;
  isAdmin: boolean;
  isStructureRestricted: boolean;
};

export async function getCurrentAccessContext(): Promise<CurrentAccessContext | null> {
  const supabase = await createSupabaseAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active") return null;

  const isAdmin = profile.app_role === "admin";
  const [restrictedResult, viewResult, editResult, excelResult, pdfResult] = await Promise.all([
    supabase.rpc("current_user_has_access_role", { p_role_code: "STRUCTURE_EDITOR" }),
    supabase.rpc("current_user_has_permission", { p_permission_code: structurePermissions.view }),
    supabase.rpc("current_user_has_permission", { p_permission_code: structurePermissions.editMatrix }),
    supabase.rpc("current_user_has_permission", { p_permission_code: structurePermissions.exportExcel }),
    supabase.rpc("current_user_has_permission", { p_permission_code: structurePermissions.exportPdf }),
  ]);
  const isStructureRestricted = !isAdmin && restrictedResult.data === true;

  return {
    canAccessStructure: isAdmin || !isStructureRestricted || viewResult.data === true,
    canEditMatrix: isAdmin || editResult.data === true,
    canExportExcel: isAdmin || !isStructureRestricted || excelResult.data === true,
    canExportPdf: isAdmin || !isStructureRestricted || pdfResult.data === true,
    canNavigateProcesses: !isStructureRestricted,
    isAdmin,
    isStructureRestricted,
  };
}

export async function requireStructureAccess() {
  const access = await getCurrentAccessContext();
  if (!access) redirect("/login");
  if (!access.canAccessStructure) redirect("/login?error=not_allowed");
  return access;
}

export async function canUseStructurePermission(permission: StructurePermission) {
  const access = await getCurrentAccessContext();
  if (!access) return false;
  if (permission === structurePermissions.view) return access.canAccessStructure;
  if (permission === structurePermissions.editMatrix) return access.canEditMatrix;
  if (permission === structurePermissions.exportExcel) return access.canExportExcel;
  return access.canExportPdf;
}

export async function getStructurePermissionClient(permission: StructurePermission) {
  if (!(await canUseStructurePermission(permission))) return null;
  return createSupabaseAuthServerClient();
}