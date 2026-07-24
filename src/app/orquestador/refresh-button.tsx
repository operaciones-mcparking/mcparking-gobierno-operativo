"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function OrquestadorRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      <RefreshCw className={`h-4 w-4 text-sea ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Actualizando..." : "Actualizar estado"}
    </button>
  );
}