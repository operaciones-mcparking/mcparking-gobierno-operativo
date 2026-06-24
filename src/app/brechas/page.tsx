import { TypedBadge } from "@/components/dashboard/badge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/dashboard/data-table";
import { DashboardShell, Panel, StatusPill } from "@/components/dashboard/shell";
import { getProcessGaps } from "@/lib/dashboard/data";

export default async function BrechasPage() {
  const { data: gaps, error } = await getProcessGaps();

  return (
    <DashboardShell
      description="Procesos que requieren accion por falta de dueno, persona asignada, respaldo o documentacion."
      eyebrow="3 Brechas"
      title="Brechas organizacionales"
    >
      <Panel count={`${gaps.length} procesos`} title="Procesos y brechas">
        {error ? (
          <div className="mt-5 rounded-lg border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {error.message}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable minWidth="820px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Proceso</DataTableHeaderCell>
                  <DataTableHeaderCell>Criticidad</DataTableHeaderCell>
                  <DataTableHeaderCell>Documentacion</DataTableHeaderCell>
                  <DataTableHeaderCell align="center">Sin rol dueno</DataTableHeaderCell>
                  <DataTableHeaderCell align="center">Sin persona duena</DataTableHeaderCell>
                  <DataTableHeaderCell align="center">Sin respaldo</DataTableHeaderCell>
                  <DataTableHeaderCell align="center">Brecha docs</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {gaps.map((gap) => (
                  <DataTableRow key={gap.process_id}>
                    <DataTableCell strong>{gap.process_name}</DataTableCell>
                    <DataTableCell>
                      <TypedBadge type="criticality" value={gap.criticality} />
                    </DataTableCell>
                    <DataTableCell>
                      <TypedBadge type="documentation" value={gap.documentation_status} />
                    </DataTableCell>
                    <DataTableCell align="center">
                      <StatusPill active={gap.missing_owner_role} />
                    </DataTableCell>
                    <DataTableCell align="center">
                      <StatusPill active={gap.missing_owner_person} />
                    </DataTableCell>
                    <DataTableCell align="center">
                      <StatusPill active={gap.missing_backup_role} />
                    </DataTableCell>
                    <DataTableCell align="center">
                      <StatusPill active={gap.documentation_gap} />
                    </DataTableCell>
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
