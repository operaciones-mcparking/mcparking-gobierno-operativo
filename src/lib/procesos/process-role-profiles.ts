import 'server-only';

import type { ProcessMasterRoleProfile } from '@/app/procesos/process-master/process-master-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type RoleProfileRow = {
  accountability_description: string | null;
  authority_description: string | null;
  id: string;
  responsibility_description: string | null;
  role_id: string;
};
type OfficialRoleRow = {
  role_id: string;
  role_name: string;
};

export async function getProcessRoleProfilesForMaster({ processId }: { processId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data: profileRows, error: profileError } = await supabase
    .from('process_role_profiles')
    .select('id,role_id,responsibility_description,authority_description,accountability_description,sort_order')
    .eq('process_id', processId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (profileError) return { data: [] as ProcessMasterRoleProfile[], error: profileError };

  const profiles = (profileRows ?? []) as RoleProfileRow[];
  const roleIds = [...new Set(profiles.map((profile) => profile.role_id))];
  if (!roleIds.length) return { data: [] as ProcessMasterRoleProfile[], error: null };

  const { data: officialRoleRows, error: roleError } = await supabase
    .from('v_role_dictionary')
    .select('role_id,role_name')
    .in('role_id', roleIds)
    .eq('role_status', 'active');

  if (roleError) return { data: [] as ProcessMasterRoleProfile[], error: roleError };

  const roleById = new Map(
    ((officialRoleRows ?? []) as OfficialRoleRow[]).map((role) => [role.role_id, role]),
  );
  const data = profiles.flatMap((profile): ProcessMasterRoleProfile[] => {
    const role = roleById.get(profile.role_id);
    if (!role) return [];
    return [{
      accountability: profile.accountability_description,
      authority: profile.authority_description,
      current_person_name: null,
      id: profile.id,
      is_process_owner: false,
      participations: [],
      responsibility: profile.responsibility_description,
      role_id: role.role_id,
      role_name: role.role_name,
    }];
  });

  return { data, error: null };
}