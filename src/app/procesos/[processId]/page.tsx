import { notFound } from "next/navigation";

import { ProcessMatrixTools } from "@/components/dashboard/process-matrix-tools";
import { DashboardShell } from "@/components/dashboard/shell";
import { getProcessCatalogV2Item, getProcessMatrixV2 } from "@/lib/dashboard/data";
import { mapProcessMasterDto } from "@/app/procesos/process-master/process-master-mapper";
import {
  ProcessMasterReadonlyActions,
  ProcessMasterSheet,
} from "@/app/procesos/process-master/process-master-sheet";

type Params = Promise<{
  processId: string;
}>;

export default async function ProcessDetailPage({ params }: { params: Params }) {
  const { processId } = await params;
  const [processResult, matrixResult] = await Promise.all([
    getProcessCatalogV2Item(processId),
    getProcessMatrixV2(processId),
  ]);

  if (!processResult.data) {
    notFound();
  }

  const process = processResult.data;
  const rows = matrixResult.data;
  const masterProcess = mapProcessMasterDto({
    process,
    stages: rows,
  });

  return (
    <DashboardShell
      description="Ficha maestra de lectura construida desde el modelo unico del proceso."
      eyebrow="Ficha de proceso"
      title={process.process_name}
    >
      <ProcessMasterSheet
        actions={<ProcessMasterReadonlyActions processId={process.process_id} />}
        mode="readonly"
        process={masterProcess}
      />

      <details className="mt-5 rounded-lg border border-line bg-white shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-navy">Matriz tecnica</h2>
              <p className="mt-1 text-sm text-slate-600">
                Filtros, revision de responsabilidades y descarga para Excel.
              </p>
            </div>
            <span className="text-sm font-semibold text-sea">{rows.length} filas</span>
          </div>
        </summary>
        <ProcessMatrixTools rows={rows} />
      </details>
    </DashboardShell>
  );
}
