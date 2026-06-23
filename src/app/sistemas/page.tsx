import { TypedBadge } from "@/components/dashboard/badge";
import { DashboardShell, Panel } from "@/components/dashboard/shell";
import { getProcessSystems } from "@/lib/dashboard/data";

export default async function SistemasPage() {
  const { data: systems, error } = await getProcessSystems();

  return (
    <DashboardShell
      description="Herramientas asociadas a procesos, con rol dueño y persona responsable actual."
      eyebrow="6 Sistemas"
      title="Sistemas por proceso"
    >
      <Panel count={`${systems.length} sistemas asociados`} title="Sistemas operativos">
        {error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {error.message}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Proceso</th>
                  <th className="py-3 pr-4 font-semibold">Subproceso</th>
                  <th className="py-3 pr-4 font-semibold">Sistema</th>
                  <th className="py-3 pr-4 font-semibold">Estado</th>
                  <th className="py-3 pr-4 font-semibold">Rol dueño</th>
                  <th className="py-3 pr-4 font-semibold">Persona dueña</th>
                  <th className="py-3 font-semibold">Notas</th>
                </tr>
              </thead>
              <tbody>
                {systems.map((system) => (
                  <tr
                    className="border-b border-line last:border-0"
                    key={`${system.process_id}-${system.system_id}`}
                  >
                    <td className="py-4 pr-4 font-medium">{system.process_name}</td>
                    <td className="py-4 pr-4">{system.subprocess_name ?? "Proceso completo"}</td>
                    <td className="py-4 pr-4">{system.system_name}</td>
                    <td className="py-4 pr-4">
                      <TypedBadge type="status" value={system.system_status} />
                    </td>
                    <td className="py-4 pr-4">{system.owner_role_name ?? "No definido"}</td>
                    <td className="py-4 pr-4">{system.owner_person_name ?? "No definida"}</td>
                    <td className="py-4">{system.notes ?? "Sin notas"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </DashboardShell>
  );
}
