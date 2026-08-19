"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ValueBadge } from "@/components/dashboard/badge";
import type { RecoveryConversationSessionPage } from "@/lib/recuperacion/recovery-conversation-sessions";

const PAGE_SIZE = 50;
const RECOVERY_TIME_ZONE = "America/Santiago";

const intentLabels: Record<string, string> = {
  api_ia: "IA / automatico",
  "carrito perdido": "Carrito perdido",
  carrito_perdido: "Carrito perdido",
  cotizar_reserva: "Cotizar reserva",
  descuentos: "Descuentos",
  modificar_reserva: "Modificar reserva",
  otros: "Otros",
  packs_subscription: "Packs",
  problema_operativo: "Problema operativo",
  reserva: "Reserva",
  ubicacion_transporte: "Ubicacion y transporte",
};

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: RECOVERY_TIME_ZONE,
  }).format(new Date(value));
}

export function formatConversationIntent(value: string | null) {
  if (!value) return "Sin clasificar";

  const normalized = value.trim().toLowerCase();
  const knownLabel = intentLabels[normalized];
  if (knownLabel) return knownLabel;

  const readable = normalized.replaceAll("_", " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function formatConversationDuration(seconds: number) {
  if (seconds < 60) return "< 1 min";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

export function conversationPurchaseLabel(hasBefore: boolean, hasAfter: boolean) {
  if (hasBefore && hasAfter) return "Previa + posterior";
  if (hasBefore) return "Compra previa";
  if (hasAfter) return "Compra posterior";

  return "Sin compra identificada";
}

export function formatPurchaseAfter(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min despues`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h despues`;

  return `${Math.round(minutes / (24 * 60))} dias despues`;
}

function chatStateLabel(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (["open", "opened", "active", "abierta"].includes(normalized ?? "")) return "Abierta";
  if (["closed", "resolved", "ended", "cerrada"].includes(normalized ?? "")) return "Cerrada";

  return "—";
}

function LoadingRows() {
  return (
    <div aria-live="polite" className="mt-5 space-y-3" role="status">
      <span className="sr-only">Cargando conversaciones...</span>
      {[0, 1, 2, 3].map((item) => (
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" key={item} />
      ))}
    </div>
  );
}

function SessionBrand({ brand }: { brand: "MCP" | "EAP" }) {
  return <ValueBadge tone={brand === "MCP" ? "info" : "warning"}>{brand}</ValueBadge>;
}

export function RecoveryConversationSessions() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RecoveryConversationSessionPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSessions() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/recuperacion/conversaciones/sesiones?page=${page}&pageSize=${PAGE_SIZE}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (!response.ok) throw new Error("No fue posible cargar las conversaciones.");

        const payload = (await response.json()) as RecoveryConversationSessionPage & { ok?: boolean };
        if (!Array.isArray(payload.sessions) || typeof payload.total !== "number") {
          throw new Error("No fue posible cargar las conversaciones.");
        }

        setResult(payload);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "No fue posible cargar las conversaciones.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSessions();
    return () => controller.abort();
  }, [page]);

  const total = result?.total ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const sessions = result?.sessions ?? [];

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <header className="border-b border-[#d6e1ea] px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-navy">Conversaciones</h2>
        <p className="mt-1 text-sm text-slate-600">
          Interacciones de WhatsApp agrupadas por cliente, marca y cercania temporal.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="text-slate-600">
            Total de interacciones <strong className="font-semibold text-navy">{total.toLocaleString("es-CL")}</strong>
          </span>
          <span className="text-slate-600">
            Registros mostrados <strong className="font-semibold text-navy">{sessions.length}</strong>
          </span>
        </div>
      </header>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {loading ? <LoadingRows /> : null}

        {!loading && error ? (
          <div className="mt-5 rounded-lg border border-[#efc3c3] bg-[#fff4f4] px-4 py-3 text-sm text-[#8a2525]" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && !error && sessions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-[#cbd8e3] px-4 py-8 text-center text-sm text-slate-600">
            No se encontraron interacciones para los filtros seleccionados.
          </div>
        ) : null}

        {!loading && !error && sessions.length > 0 ? (
          <>
            <div className="mt-5 space-y-3 md:hidden">
              {sessions.map((session) => (
                <article className="rounded-lg border border-[#d6e1ea] p-4" key={session.sessionId}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">{formatConversationIntent(session.primaryIntent)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatSessionDate(session.firstMessageAt)}</p>
                    </div>
                    <SessionBrand brand={session.brand} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Mensajes / duracion</dt>
                      <dd className="mt-1 text-slate-800">{session.messageCount} · {formatConversationDuration(session.durationSeconds)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Estado</dt>
                      <dd className="mt-1 text-slate-800">{chatStateLabel(session.chatState)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500">Compra</dt>
                      <dd className="mt-1 text-slate-800">
                        {conversationPurchaseLabel(session.hasValidPurchaseBefore, session.hasValidPurchaseAfter)}
                        {session.nearestPurchaseAfterMinutes !== null ? ` · ${formatPurchaseAfter(session.nearestPurchaseAfterMinutes)}` : ""}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500">Carrito</dt>
                      <dd className="mt-1 text-slate-800">{session.potentialCartRelation ? "Relacionado" : "—"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="min-w-[1120px] table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-[#d6e1ea] bg-[#f4f7fa] text-xs uppercase text-slate-600">
                    <th className="w-36 px-3 py-3 font-semibold">Inicio</th>
                    <th className="w-20 px-3 py-3 font-semibold">Marca</th>
                    <th className="w-44 px-3 py-3 font-semibold">Intencion</th>
                    <th className="w-20 px-3 py-3 text-right font-semibold">Mensajes</th>
                    <th className="w-24 px-3 py-3 font-semibold">Duracion</th>
                    <th className="w-44 px-3 py-3 font-semibold">Compra</th>
                    <th className="w-32 px-3 py-3 font-semibold">Compra posterior</th>
                    <th className="w-24 px-3 py-3 font-semibold">Carrito</th>
                    <th className="w-20 px-3 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr className="border-b border-[#e3eaf0] align-top text-slate-700" key={session.sessionId}>
                      <td className="px-3 py-3">{formatSessionDate(session.firstMessageAt)}</td>
                      <td className="px-3 py-3"><SessionBrand brand={session.brand} /></td>
                      <td className="break-words px-3 py-3 font-medium text-slate-900">{formatConversationIntent(session.primaryIntent)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{session.messageCount}</td>
                      <td className="px-3 py-3">{formatConversationDuration(session.durationSeconds)}</td>
                      <td className="px-3 py-3">{conversationPurchaseLabel(session.hasValidPurchaseBefore, session.hasValidPurchaseAfter)}</td>
                      <td className="px-3 py-3">{formatPurchaseAfter(session.nearestPurchaseAfterMinutes)}</td>
                      <td className="px-3 py-3">{session.potentialCartRelation ? <ValueBadge tone="info">Relacionado</ValueBadge> : "—"}</td>
                      <td className="px-3 py-3">{chatStateLabel(session.chatState)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {!loading && !error ? (
          <nav aria-label="Paginacion de conversaciones" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#d6e1ea] pt-4">
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd8e3] px-3 py-2 text-sm font-medium text-navy disabled:cursor-not-allowed disabled:opacity-45"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Anterior
            </button>
            <span className="text-sm text-slate-600">Pagina {page} de {totalPages}</span>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd8e3] px-3 py-2 text-sm font-medium text-navy disabled:cursor-not-allowed disabled:opacity-45"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Siguiente
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
