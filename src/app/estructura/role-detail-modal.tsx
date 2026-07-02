"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

import { Badge, ValueBadge } from "@/components/dashboard/badge";
import type { OrgRole } from "@/lib/dashboard/organization";
import { RoleEditModal } from "./role-edit-modal";

function roleTone(level: OrgRole["level"]) {
  if (level === "Direccion") return "info";
  if (level === "Gestion") return "warning";
  return "success";
}

export function RoleDetailButton({
  canEdit = false,
  role,
  variant = "light",
}: {
  canEdit?: boolean;
  role: OrgRole;
  variant?: "dark" | "light";
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const hasPerson = role.person !== "Sin persona asignada";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        aria-label={`Ver detalle de ${role.title}`}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-xs transition ${
          variant === "dark"
            ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
            : "border-[#cbd8e3] bg-[#f8fafb] text-sea hover:border-sea hover:bg-white"
        }`}
        onClick={() => setOpen(true)}
        title="Ver detalle del cargo"
        type="button"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/45 px-4 py-6 backdrop-blur-sm">
              <button
                aria-label="Cerrar detalle"
                className="absolute inset-0"
                onClick={() => setOpen(false)}
                type="button"
              />

              <section
                aria-labelledby={`role-detail-${role.code}`}
                aria-modal="true"
                className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
                role="dialog"
              >
                <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                      Detalle del cargo
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h2
                        className="text-lg font-medium leading-tight text-navy"
                        id={`role-detail-${role.code}`}
                      >
                        {role.title}
                      </h2>
                      <ValueBadge tone={hasPerson ? "success" : "neutral"}>{role.code}</ValueBadge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Persona actual: <span className="font-medium text-navy">{role.person}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <RoleEditModal canEdit={canEdit} role={role} />
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

                <div className="max-h-[72vh] overflow-y-auto p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fafb] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Area
                      </p>
                      <p className="mt-1 text-sm font-medium text-navy">{role.area}</p>
                    </div>
                    <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fafb] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Nivel
                      </p>
                      <div className="mt-1">
                        <Badge tone={roleTone(role.level)}>{role.level}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-navy">Objetivo / descripcion del rol</h3>
                    <p className="mt-2 rounded-xl border border-[#d6e1ea] bg-white p-4 text-sm leading-6 text-slate-700">
                      {role.objective}
                    </p>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-navy">Responsabilidades principales</h3>
                    {role.responsibilities.length > 0 ? (
                      <ul className="mt-2 space-y-2 rounded-xl border border-[#d6e1ea] bg-white p-4 text-sm leading-6 text-slate-700">
                        {role.responsibilities.map((responsibility) => (
                          <li className="flex gap-2" key={responsibility}>
                            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sea" />
                            <span>{responsibility}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 rounded-xl border border-dashed border-[#cbd8e3] bg-[#f8fafb] p-4 text-sm text-slate-500">
                        Sin responsabilidades registradas.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
