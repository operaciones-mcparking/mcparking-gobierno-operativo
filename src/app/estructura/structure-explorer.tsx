"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Filter, Lock, Search, Unlock, X } from "lucide-react";

import { toggleRoleGovernanceProcessInline } from "@/app/admin/actions";
import { ValueBadge } from "@/components/dashboard/badge";
import type { GovernanceProcess, OrgRole } from "@/lib/dashboard/organization";

const allOption = "todos";

type RoleGovernanceAssignment = {
  process_key: string;
  role_id: string;
  status: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function StructureExplorer({
  assignments,
  canEdit,
  processes,
  roles,
}: {
  assignments: RoleGovernanceAssignment[];
  canEdit: boolean;
  processes: GovernanceProcess[];
  roles: OrgRole[];
}) {
  const [area, setArea] = useState(allOption);
  const [role, setRole] = useState(allOption);
  const [query, setQuery] = useState("");
  const [matrixEditingEnabled, setMatrixEditingEnabled] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const areas = useMemo(
    () => Array.from(new Set(processes.map((process) => process.area))).sort(),
    [processes],
  );

  const [assignmentKeys, setAssignmentKeys] = useState(() => {
    const activeAssignments = assignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => `${assignment.role_id}:${assignment.process_key}`);

    if (activeAssignments.length > 0) {
      return new Set(activeAssignments);
    }

    return new Set(
      processes.flatMap((process) =>
        roles
          .filter((item) => item.id && process.roles.includes(item.code))
          .map((item) => `${item.id}:${process.name}`),
      ),
    );
  });
  const hasPersistedAssignments = assignments.length > 0;
  const isRoleActive = (process: GovernanceProcess, item: OrgRole) => {
    if ((hasPersistedAssignments || assignmentKeys.size > 0) && item.id) {
      return assignmentKeys.has(`${item.id}:${process.name}`);
    }

    return process.roles.includes(item.code);
  };

  function toggleAssignment(process: GovernanceProcess, item: OrgRole, active: boolean) {
    if (!canEdit || !matrixEditingEnabled || !item.id) return;

    const key = `${item.id}:${process.name}`;
    setPendingKey(key);
    setMatrixError(null);

    setAssignmentKeys((current) => {
      const next = new Set(current);
      if (active) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    startTransition(async () => {
      const result = await toggleRoleGovernanceProcessInline(item.id as string, process.name, active);

      if (result.error) {
        setAssignmentKeys((current) => {
          const next = new Set(current);
          if (active) {
            next.add(key);
          } else {
            next.delete(key);
          }
          return next;
        });
        setMatrixError(result.error);
      }

      setPendingKey(null);
    });
  }

  const filteredProcesses = processes.filter((process) => {
    const matchesArea = area === allOption || process.area === area;
    const matchesRole =
      role === allOption ||
      roles.some((item) => item.code === role && isRoleActive(process, item));
    const matchesQuery =
      query.trim().length === 0 ||
      normalize(`${process.name} ${process.description} ${process.area}`).includes(
        normalize(query),
      );

    return matchesArea && matchesRole && matchesQuery;
  });

  const matrixTemplate = {
    gridTemplateColumns: `270px repeat(${roles.length}, 74px)`,
  };

  return (
    <div className="mt-5 space-y-4">
      {canEdit ? <div className="flex justify-end">
        <button
          aria-checked={matrixEditingEnabled}
          aria-label={matrixEditingEnabled ? "Desactivar modo edición de la matriz" : "Activar modo edición de la matriz"}
          className="inline-flex min-h-10 items-center gap-3 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-semibold text-navy transition hover:border-sea focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
          onClick={() => setMatrixEditingEnabled((enabled) => !enabled)}
          role="switch"
          type="button"
        >
          {matrixEditingEnabled ? <Unlock className="h-4 w-4 text-sea" /> : <Lock className="h-4 w-4 text-slate-500" />}
          <span>{matrixEditingEnabled ? "Modo edición activado" : "Edición bloqueada"}</span>
          <span
            aria-hidden="true"
            className={`relative h-5 w-9 rounded-full transition ${matrixEditingEnabled ? "bg-sea" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${matrixEditingEnabled ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
      </div> : null}
      <div className="grid gap-3 rounded-xl border border-[#cbd8e3] bg-[#f8fafb] p-4 lg:grid-cols-[1.2fr_220px_220px_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-navy">
            <Filter className="h-4 w-4 text-sea" />
            Filtros dinamicos
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="w-full bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar proceso, area o descripcion"
              value={query}
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Tipo de operacion
          <select
            className="rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy"
            onChange={(event) => setArea(event.target.value)}
            value={area}
          >
            <option value={allOption}>Todos los tipos</option>
            {areas.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Rol
          <select
            className="rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy"
            onChange={(event) => setRole(event.target.value)}
            value={role}
          >
            <option value={allOption}>Todos los roles</option>
            {roles.map((item) => (
              <option key={item.code} value={item.code}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8]"
          onClick={() => {
            setArea(allOption);
            setRole(allOption);
            setQuery("");
          }}
          type="button"
        >
          <X className="h-4 w-4" />
          Limpiar
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#cbd8e3] bg-white">
        {matrixError ? (
          <div className="border-b border-[#ffd6b0] bg-[#ffe6ca] px-4 py-3 text-sm font-medium text-[#86510d]">
            {matrixError}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${270 + roles.length * 74 + 32}px` }}>
            <div
              className="grid items-center border-b border-[#cbd8e3] bg-[#f3f6f8] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-600"
              style={matrixTemplate}
            >
              <div>Proceso transversal</div>
              {roles.map((item, index) => (
                <div className="text-center" key={`${item.code}-${index}`} title={item.title}>
                  {item.code}
                </div>
              ))}
            </div>

            <div className="divide-y divide-[#edf2f6]">
              {filteredProcesses.map((process) => (
                <div
                  className="grid items-center px-4 py-3 transition hover:bg-[#fbfcfd]"
                  key={process.name}
                  style={matrixTemplate}
                >
                  <div className="pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-navy">{process.name}</h3>
                      <ValueBadge tone="info">{process.area}</ValueBadge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                      {process.description}
                    </p>
                  </div>

                  {roles.map((item, roleIndex) => {
                    const active = isRoleActive(process, item);
                    const key = item.id ? `${item.id}:${process.name}` : `${process.name}-${item.code}`;
                    const pending = pendingKey === key;

                    return (
                      <div
                        className="flex h-12 items-center justify-center"
                        key={`${process.name}-${item.code}-${roleIndex}`}
                        title={`${process.name} - ${item.title}`}
                      >
                        <button
                          aria-label={`${active ? "Quitar" : "Agregar"} relación entre ${process.name} y ${item.title}`}
                          className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm transition ${
                            active
                              ? `border-[#9fd9b9] bg-[#eefaf2] text-[#22613b] ${matrixEditingEnabled ? "hover:bg-[#dff4e7]" : "cursor-not-allowed opacity-80"}`
                              : `border-[#e3ebf1] bg-[#f8fbfd] text-transparent ${matrixEditingEnabled ? "hover:border-sea hover:bg-[#eef7fb]" : "cursor-not-allowed opacity-80"}`
                          } ${pending ? "animate-pulse ring-2 ring-[#dceaf2]" : ""}`}
                          disabled={!canEdit || !matrixEditingEnabled || !item.id || pending}
                          onClick={() => toggleAssignment(process, item, active)}
                          type="button"
                        >
                          {active ? <Check className="h-4 w-4" /> : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {filteredProcesses.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-600">
            No hay procesos para los filtros seleccionados.
          </div>
        ) : null}
      </div>

    </div>
  );
}
