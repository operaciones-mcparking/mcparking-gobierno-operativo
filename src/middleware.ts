import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/auth/callback"];
const recoveryPurchasesSyncPath = "/api/recuperacion/compras/sync";
const pdfPath = /^\/api\/procesos\/[0-9a-f-]+\/pdf$/i;
const structureProcessDetailPath = /^\/api\/estructura\/procesos\/[0-9a-f-]+\/ficha$/i;

function denied(request: NextRequest, status = 403) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado.", ok: false }, { status });
  }
  return NextResponse.redirect(new URL("/estructura", request.url));
}

function loginDenied(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === recoveryPurchasesSyncPath) {
    return NextResponse.next();
  }

  if (publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (pathname.startsWith("/api/")) return denied(request, 401);
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active") return loginDenied(request);
  if (profile.app_role === "admin") return response;

  const { data: restricted } = await supabase.rpc("current_user_has_access_role", {
    p_role_code: "STRUCTURE_EDITOR",
  });
  if (restricted !== true) return response;

  let requiredPermission: string | null = null;
  if (pathname === "/" || pathname === "/estructura") requiredPermission = "structure.view";
  if (pathname === "/api/procesos/export") requiredPermission = "structure.export.excel";
  if (structureProcessDetailPath.test(pathname)) requiredPermission = "structure.view";
  if (pdfPath.test(pathname)) requiredPermission = "structure.export.pdf";
  if (!requiredPermission) return denied(request);

  const { data: allowed } = await supabase.rpc("current_user_has_permission", {
    p_permission_code: requiredPermission,
  });
  if (allowed === true) return response;
  return requiredPermission === "structure.view" ? loginDenied(request) : denied(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mcparking-logo.svg|mcparking-logo-pdf.png).*)"],
};