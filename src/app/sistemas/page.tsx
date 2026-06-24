import { TypedBadge } from "@/components/dashboard/badge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/dashboard/data-table";
import { DashboardShell, Panel } from "@/components/dashboard/shell";
import { getProcessSystems } from "@/lib/dashboard/data";

export default async function SistemasPage() {
  const { data: systems, error } = await getProcessSystems();

  return (
    <DashboardShell
      description="Herramientas asociadas a procesos, con rol dueno y persona responsable actual."
      eyebrow="6 Sistemas"
      title="Sistemas por proceso"
    >
      <Panel count={`${systems.length} sistemas asociados`} title="Sistemas operativos">
        {error ? (
          <div className="mt-5 rounded-lg border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {error.message}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable minWidth="920px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Proceso</DataTableHeaderCell>
                  <DataTableHeaderCell>Subproceso</DataTableHeaderCell>
                  <DataTableHeaderCell>Sistema</DataTableHeaderCell>
                  <DataTableHeaderCell>Estado</DataTableHeaderCell>
                  <DataTableHeaderCell>Rol dueno</DataTableHeaderCell>
                  <DataTableHeaderCell>Persona duena</DataTableHeaderCell>
                  <DataTableHeaderCell>Notas</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {systems.map((system) => (
                  <DataTableRow key={`${system.process_id}-${system.system_id}`}>
                    <DataTableCell strong>{system.process_name}</DataTableCell>
                    <DataTableCell>{system.subprocess_name ?? "Proceso completo"}</DataTableCell>
                    <DataTableCell>{system.system_name}</DataTableCell>
                    <DataTableCell>
                      <TypedBadge type="status" value={system.system_status} />
                    </DataTableCell>
                    <DataTableCell>{system.owner_role_name ?? "No definido"}</DataTableCell>
                    <DataTableCell>{system.owner_person_name ?? "No definida"}</DataTableCell>
                    <DataTableCell>{system.notes ?? "Sin notas"}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </Panel>
    </DashboardShell>
  );
}
