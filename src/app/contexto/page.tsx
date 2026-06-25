import { redirect } from "next/navigation";

import { ContextStart } from "@/app/contexto/context-start";
import { getOperationalContextOptions } from "@/lib/dashboard/data";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export default async function ContextPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    redirect("/login?error=not_allowed");
  }

  const contextOptions = await getOperationalContextOptions();

  return (
    <ContextStart
      countries={contextOptions.countries}
      nextPath={params.next ?? "/estructura"}
      sites={contextOptions.sites}
    />
  );
}
