import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function getActiveAdminUser() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, reason: "unauthenticated" as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false as const, reason: "error" as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { ok: false as const, reason: "forbidden" as const };
  }

  return { ok: true as const, user };
}
