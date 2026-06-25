import { redirect } from "next/navigation";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ country_id?: string; site_id?: string }>;
}) {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.country_id) {
    query.set("country_id", params.country_id);
  }

  if (params.site_id) {
    query.set("site_id", params.site_id);
  }

  const nextQuery = query.toString();
  redirect(nextQuery ? `/estructura?${nextQuery}` : "/estructura");
}
