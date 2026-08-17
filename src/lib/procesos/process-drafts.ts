import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export type ProcessDraftSummary = {
  companyName: string;
  id: string;
  lastEditedAt: string | null;
  name: string;
  ownerRoleName: string | null;
  processCode: string;
  processType: string;
};

export async function getProcessDrafts(context: { countryId?: string | null; siteId?: string | null } = {}) {
  const auth = await createSupabaseAuthServerClient();
  const { data: { user } } = await auth.auth.getUser();

  if (!user) return { data: [] as ProcessDraftSummary[], error: null };

  const { data: profile, error: profileError } = await auth
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active" || profile.app_role !== "admin") {
    return { data: [] as ProcessDraftSummary[], error: profileError };
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("processes")
    .select("id,name,company_id,owner_role_id,process_code,process_type,master_updated_at,updated_at")
    .eq("status", "inactive")
    .eq("documentation_status", "draft")
    .not("process_code", "is", null)
    .order("master_updated_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (context.countryId) query = query.eq("country_id", context.countryId);
  if (context.siteId) query = query.or(`owner_site_id.eq.${context.siteId},operating_site_id.eq.${context.siteId}`);

  const { data: drafts, error } = await query;
  if (error || !drafts) return { data: [] as ProcessDraftSummary[], error };

  const companyIds = [...new Set(drafts.map((draft) => draft.company_id).filter(Boolean))];
  const roleIds = [...new Set(drafts.map((draft) => draft.owner_role_id).filter((id): id is string => Boolean(id)))];
  const [companiesResult, rolesResult] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id,name").in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    roleIds.length
      ? supabase.from("v_role_dictionary").select("role_id,role_name").in("role_id", roleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = companiesResult.error ?? rolesResult.error;
  if (relatedError) return { data: [] as ProcessDraftSummary[], error: relatedError };

  const companyById = new Map((companiesResult.data ?? []).map((company) => [company.id, company.name]));
  const roleById = new Map((rolesResult.data ?? []).map((role) => [role.role_id, role.role_name]));

  return {
    data: drafts.map((draft) => ({
      companyName: companyById.get(draft.company_id) ?? "Sin empresa",
      id: draft.id,
      lastEditedAt: draft.master_updated_at ?? draft.updated_at ?? null,
      name: draft.name,
      ownerRoleName: draft.owner_role_id ? roleById.get(draft.owner_role_id) ?? null : null,
      processCode: draft.process_code,
      processType: draft.process_type,
    })),
    error: null,
  };
}