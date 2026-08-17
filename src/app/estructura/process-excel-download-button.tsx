"use client";

import { useState } from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

function responseFilename(response: Response) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `Maestro_de_Procesos_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function ProcessExcelDownloadButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/procesos/export", { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "No se pudo preparar el archivo Excel.");
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = responseFilename(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "No se pudo preparar el archivo Excel.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        aria-busy={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#9bcbdc] bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={download}
        type="button"
      >
        {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-sea" /> : <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-sea" />}
        {pending ? "Preparando Excel..." : "Descargar Excel"}
      </button>
      {error ? <p aria-live="polite" className="max-w-64 text-xs font-medium text-[#9b3434]">{error}</p> : null}
    </div>
  );
}