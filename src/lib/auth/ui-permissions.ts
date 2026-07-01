import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export type RolePersonUiCapabilities = {
  canArchivePeople: boolean;
  canArchiveRoles: boolean;
  canCreatePeople: boolean;
  canCreateRoles: boolean;
  canEditPeople: boolean;
  canEditRoles: boolean;
  canViewPeople: boolean;
  canViewRoles: boolean;
};

const noAccess: RolePersonUiCapabilities = {
  canArchivePeople: false,
  canArchiveRoles: false,
  canCreatePeople: false,
  canCreateRoles: false,
  canEditPeople: false,
  canEditRoles: false,
  canViewPeople: false,
  canViewRoles: false,
};

const readOnlyAccess: RolePersonUiCapabilities = {
  ...noAccess,
  canViewPeople: true,
  canViewRoles: true,
};

const fullAccess: RolePersonUiCapabilities = {
  canArchivePeople: true,
  canArchiveRoles: true,
  canCreatePeople: true,
  canCreateRoles: true,
  canEditPeople: true,
  canEditRoles: true,
  canViewPeople: true,
  canViewRoles: true,
};

export async function getRolePersonUiCapabilities(): Promise<RolePersonUiCapabilities> {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return noAccess;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    return noAccess;
  }

  if (profile.app_role === "admin") {
    return fullAccess;
  }

  return readOnlyAccess;
}
