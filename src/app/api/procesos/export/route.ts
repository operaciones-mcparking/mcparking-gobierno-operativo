import { NextResponse } from "next/server";

import { getProcessCatalogV2 } from "@/lib/dashboard/data";
import { generateProcessMasterExcel, processMasterExcelFilename } from "@/lib/procesos/process-excel";
import { getProcessMasterReadModel } from "@/lib/procesos/process-master-read-model";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

export async function GET() {
  const supabase = await createSupabaseAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("No autenticado.", 401);

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile || profile.status !== "active") return jsonError("No autorizado.", 403);

  const catalogResult = await getProcessCatalogV2();
  if (catalogResult.error) return jsonError("No se pudo cargar el catálogo de procesos.", 500);

  const officialProcesses = catalogResult.data.filter((process) => process.status === "active" && Boolean(process.process_code?.trim()));
  const masterResults = await Promise.all(
    officialProcesses.map((process) => getProcessMasterReadModel(process.process_id)),
  );
  if (masterResults.some((result) => !result.data || result.error)) {
    return jsonError("No se pudo cargar la ficha completa de todos los procesos.", 500);
  }

  try {
    const bytes = await generateProcessMasterExcel(masterResults.flatMap((result) => result.data ? [result.data] : []));
    const body = bytes as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "attachment; filename=" + JSON.stringify(processMasterExcelFilename()),
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
      },
      status: 200,
    });
  } catch {
    return jsonError("No se pudo generar el archivo Excel.", 500);
  }
}