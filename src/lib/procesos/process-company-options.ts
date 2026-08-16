import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ProcessCompanyOption = {
  id: string;
  name: string;
};

function processCompanyPriority(name: string) {
  const normalized = name.trim().toLocaleLowerCase("es");
  if (normalized === "mcparking") return 0;
  if (normalized === "el alba") return 1;
  return 2;
}

export async function getActiveProcessCompanyOptions() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name")
    .eq("status", "active");

  const companies = (data ?? [])
    .filter((company) => company.id && company.name)
    .map((company) => ({ id: String(company.id), name: String(company.name) }))
    .sort((left, right) => {
      const priority = processCompanyPriority(left.name) - processCompanyPriority(right.name);
      return priority || left.name.localeCompare(right.name, "es");
    });

  return { data: companies, error };
}

export type ProcessOperationTypeOption = {
  companyId: string;
  id: string;
  name: string;
};

export async function getActiveProcessOperationTypeOptions() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("areas")
    .select("id,name,company_id,companies!inner(status)")
    .eq("status", "active")
    .eq("companies.status", "active")
    .order("name");

  const operationTypes = (data ?? [])
    .filter((area) => area.id && area.name && area.company_id)
    .map((area) => ({
      companyId: String(area.company_id),
      id: String(area.id),
      name: String(area.name),
    }));

  return { data: operationTypes, error };
}