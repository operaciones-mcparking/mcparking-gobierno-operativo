"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Archive, Info, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { archiveRoleInline } from "@/app/admin/actions";
import { Badge, ValueBadge } from "@/components/dashboard/badge";
import type { OrgRole } from "@/lib/dashboard/organization";
import { RoleEditModal } from "./role-edit-modal";

function roleTone(level: OrgRole["level"]) {
  if (level === "Direccion") return "info";
  if (level === "Gestion") return "warning";
  return "success";
}

export function ArchiveRoleButton({
  canArchive = false,
  onArchived,
  role,
}: {
  canArchive?: boolean;
  onArchived?: (message: string) => void;
  role: OrgRole;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  if (!canArchive || !role.id) {
    return null;
  }

  function handleArchive() {
    const confirmed = window.confirm(
      "Archivar este cargo? El cargo dejara de aparecer como activo y se conservara como historial.",
    );

    if (!confirmed || !role.id) return;

    const formData = new FormData();
    formData.set("role_id", role.id);

    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await archiveRoleInline(formData);

      if (!result.ok) {
        setError(result.error || "No se pudo archivar el cargo.");
        return;
      }

      if (onArchived) {
        onArchived("Cargo archivado");
      } else {
        setNotice("Cargo archivado");
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5d2bf] bg-[#fff8ef] px-3 py-2 text-sm font-medium text-[#8a5b2d] transition hover:border-[#d9b98f] hover:bg-[#fff3e2] disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        onClick={handleArchive}
        type="button"
      >
        <Archive className="h-4 w-4" />
        {isPending ? "Archivando..." : "Archivar cargo"}
      </button>
      {error ? (
        <p className="rounded-lg border border-[#ffd6b0] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a4a16]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <span className="fixed right-5 top-5 z-[70] inline-flex items-center rounded-lg border border-[#c9ead7] bg-[#f0fbf4] px-3 py-2 text-sm font-medium text-[#167344] shadow-[0_16px_32px_rgba(2,53,116,0.14)]">
          {notice}
        </span>
      ) : null}
    </div>
  );
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
  const [notice, setNotice] = useState<string | null>(null);
  const hasPerson = role.person !== "Sin persona asignada";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);

    return () => window.clearTimeout(timeout);
  }, [notice]);

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
                    <ArchiveRoleButton
                      canArchive={canEdit}
                      onArchived={(message) => {
                        setOpen(false);
                        setNotice(message);
                      }}
                      role={role}
                    />
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
      {notice ? (
        <span className="fixed right-5 top-5 z-[70] inline-flex items-center rounded-lg border border-[#c9ead7] bg-[#f0fbf4] px-3 py-2 text-sm font-medium text-[#167344] shadow-[0_16px_32px_rgba(2,53,116,0.14)]">
          {notice}
        </span>
      ) : null}
    </>
  );
}
