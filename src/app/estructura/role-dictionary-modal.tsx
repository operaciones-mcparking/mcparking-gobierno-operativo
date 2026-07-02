"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, X } from "lucide-react";

import { Badge, ValueBadge } from "@/components/dashboard/badge";
import type { PersonDirectoryItem } from "@/lib/dashboard/data";
import type { OrgRole } from "@/lib/dashboard/organization";
import { PersonDetailModal } from "./person-detail-modal";

function roleTone(level: OrgRole["level"]) {
  if (level === "Direccion") return "info";
  if (level === "Gestion") return "warning";
  return "success";
}

export function RoleDictionaryModal({
  activePeople,
  archivedPeople,
  canArchivePeople,
  canEditPeople,
  returnTo,
  roles,
}: {
  activePeople: PersonDirectoryItem[];
  archivedPeople: PersonDirectoryItem[];
  canArchivePeople: boolean;
  canEditPeople: boolean;
  returnTo: string;
  roles: OrgRole[];
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"roles" | "people">("roles");
  const totalPeople = activePeople.length + archivedPeople.length;

  return (
    <>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <BookOpen className="h-4 w-4 text-sea" />
        Diccionario
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/45 px-4 py-6 backdrop-blur-sm">
          <button
            aria-label="Cerrar diccionario"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
            type="button"
          />

          <section
            aria-labelledby="role-dictionary-title"
            aria-modal="true"
            className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Consulta rapida
                </p>
                <h2 id="role-dictionary-title" className="mt-1 text-lg font-medium text-navy">
                  Diccionario operativo
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Consulta roles, cargos y personas activas del modelo operativo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-[#d6e1ea] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-slate-600">
                  {roles.length} roles
                </span>
                <span className="rounded-md border border-[#d6e1ea] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-slate-600">
                  {totalPeople} personas
                </span>
                <button
                  aria-label="Cerrar"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white text-slate-500 transition hover:border-sea hover:text-navy"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-[#d6e1ea] bg-[#f8fafb] p-1">
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    activeTab === "roles"
                      ? "bg-white text-navy shadow-sm"
                      : "text-slate-600 hover:bg-white/70 hover:text-navy"
                  }`}
                  onClick={() => setActiveTab("roles")}
                  type="button"
                >
                  Roles / cargos
                </button>
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    activeTab === "people"
                      ? "bg-white text-navy shadow-sm"
                      : "text-slate-600 hover:bg-white/70 hover:text-navy"
                  }`}
                  onClick={() => setActiveTab("people")}
                  type="button"
                >
                  Personas
                </button>
              </div>

              {activeTab === "roles" && roles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#cbd8e3] bg-[#f8fafb] p-8 text-center text-sm text-slate-600">
                  No hay roles para mostrar en este contexto.
                </div>
              ) : null}

              {activeTab === "roles" && roles.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {roles.map((role, index) => {
                    return (
                      <details
                        className="group rounded-xl border border-[#cbd8e3] bg-[#fbfcfd] p-3 transition open:bg-white open:shadow-[0_12px_28px_rgba(2,53,116,0.07)]"
                        key={role.id ?? `${role.code}-${index}`}
                      >
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-navy">
                                {role.title}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-600">
                                Persona:{" "}
                                <span className="font-medium text-navy">{role.person}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                              <Badge tone={roleTone(role.level)}>{role.level}</Badge>
                              <ValueBadge tone="neutral">
                                {role.code}
                              </ValueBadge>
                              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                            </div>
                          </div>
                        </summary>

                        <div className="mt-4 border-t border-[#d6e1ea] pt-4">
                          <div className="mb-3 flex items-center gap-2">
                            <ValueBadge tone="neutral">{role.code}</ValueBadge>
                            <span className="text-xs text-slate-500">{role.area}</span>
                          </div>
                          <p className="text-sm leading-6 text-slate-700">{role.objective}</p>
                          {role.responsibilities.length > 0 ? (
                            <ul className="mt-3 space-y-2 text-sm text-slate-700">
                              {role.responsibilities.map((responsibility) => (
                                <li className="flex gap-2" key={responsibility}>
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sea" />
                                  <span>{responsibility}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500">
                              Sin responsabilidades registradas.
                            </p>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : null}

              {activeTab === "people" && totalPeople === 0 ? (
                <div className="rounded-xl border border-dashed border-[#cbd8e3] bg-[#f8fafb] p-8 text-center text-sm text-slate-600">
                  No hay personas activas para mostrar en este contexto.
                </div>
              ) : null}

              {activeTab === "people" && totalPeople > 0 ? (
                <div className="grid gap-5">
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-medium text-navy">Personas activas</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Personas disponibles para responsabilidades actuales.
                        </p>
                      </div>
                      <span className="rounded-md border border-[#d6e1ea] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-slate-600">
                        {activePeople.length} activas
                      </span>
                    </div>

                    {activePeople.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#cbd8e3] bg-[#f8fafb] p-5 text-sm text-slate-600">
                        No hay personas activas para este contexto.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[#d6e1ea] bg-white">
                        <div className="hidden grid-cols-[1.2fr_1fr_0.8fr_auto] gap-3 border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 md:grid">
                          <span>Nombre</span>
                          <span>Email</span>
                          <span>Telefono</span>
                          <span className="text-right">Accion</span>
                        </div>
                        <div className="divide-y divide-[#edf2f6]">
                          {activePeople.map((person) => (
                            <PersonDetailModal
                              canArchive={canArchivePeople}
                              canEdit={canEditPeople}
                              key={person.id}
                              person={person}
                              returnTo={returnTo}
                              variant="compact"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-medium text-navy">Personas archivadas</h3>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                          Las personas archivadas no aparecen como activas ni otorgan responsabilidades actuales. Se conservan como historial.
                        </p>
                      </div>
                      <span className="rounded-md border border-[#d6e1ea] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-slate-600">
                        {archivedPeople.length} archivadas
                      </span>
                    </div>

                    {archivedPeople.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#cbd8e3] bg-[#f8fafb] p-5 text-sm text-slate-600">
                        No hay personas archivadas para este contexto.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[#d6e1ea] bg-white">
                        <div className="hidden grid-cols-[1.2fr_1fr_0.8fr_0.7fr_auto] gap-3 border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 md:grid">
                          <span>Nombre</span>
                          <span>Email</span>
                          <span>Telefono</span>
                          <span>Estado</span>
                          <span className="text-right">Accion</span>
                        </div>
                        <div className="divide-y divide-[#edf2f6]">
                          {archivedPeople.map((person) => (
                            <PersonDetailModal
                              canArchive={canArchivePeople}
                              canEdit={canEditPeople}
                              key={person.id}
                              person={person}
                              returnTo={returnTo}
                              showStatusInCompact
                              variant="compact"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
