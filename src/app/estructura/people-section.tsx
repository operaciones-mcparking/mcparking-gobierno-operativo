import { PlusCircle } from "lucide-react";

import type { PersonDirectoryItem } from "@/lib/dashboard/data";
import { PersonDetailModal } from "./person-detail-modal";

export function PeopleSection({
  canArchive,
  canCreate,
  canEdit,
  people,
  returnTo,
}: {
  canArchive: boolean;
  canCreate: boolean;
  canEdit: boolean;
  people: PersonDirectoryItem[];
  returnTo: string;
}) {
  const activePeople = people.filter((person) => person.status === "active");

  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-[#f8fafb] p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-navy">Personas del modelo operativo</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Lista activa de personas asociadas a roles funcionales, procesos y responsabilidades.
          </p>
        </div>
        <div className="sm:text-right">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white opacity-55"
            disabled
            title="Agregar persona estara disponible en la siguiente etapa."
            type="button"
          >
            <PlusCircle className="h-4 w-4" />
            Agregar persona
          </button>
          <p className="mt-2 max-w-xs text-xs text-slate-500">
            {canCreate
              ? "Agregar persona estara disponible en la siguiente etapa."
              : "Agregar persona requiere permisos de administracion y estara disponible en la siguiente etapa."}
          </p>
        </div>
      </div>

      {activePeople.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-5 text-sm text-slate-600">
          No hay personas activas para este contexto.
        </div>
      ) : (
        <div className="grid gap-3">
          {activePeople.map((person) => (
            <PersonDetailModal
              canArchive={canArchive}
              canEdit={canEdit}
              key={person.id}
              person={person}
              returnTo={returnTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
