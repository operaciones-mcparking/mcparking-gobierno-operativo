import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/estructura";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=google", requestUrl.origin));
  }

  const supabase = await createSupabaseAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=google", requestUrl.origin));
  }

  const { data: allowed, error: allowError } = await supabase.rpc(
    "ensure_user_profile_from_allowlist",
  );

  if (allowError || allowed !== true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", requestUrl.origin));
  }

  return NextResponse.redirect(
    new URL(`/contexto?next=${encodeURIComponent(next)}`, requestUrl.origin),
  );
}
