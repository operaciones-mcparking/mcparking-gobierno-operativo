'use client';

import { Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { ProcessMultiRoleSelector, type ProcessResponsibleRoleOption } from './process-multi-role-selector';
import { useProcessMasterSaveSection } from './process-master-save-coordinator';
import type { ProcessMasterMetric, ProcessMetricSaveRow } from './process-master-types';

type SaveResult = { data: ProcessMetricSaveRow[] | null; error: string | null };
type Props = {
  action: (processId: string, rows: ProcessMetricSaveRow[]) => Promise<SaveResult>;
  processId: string;
  roleOptions: ProcessResponsibleRoleOption[];
  rows: ProcessMasterMetric[];
};
type EditableMetric = ProcessMetricSaveRow & { localId: string };

const frequencies = ['', 'Diaria', 'Semanal', 'Quincenal', 'Mensual', 'Trimestral', 'Semestral', 'Anual'];
const fieldClass = 'h-[72px] min-h-[72px] w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20';
const selectClass = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20';
const metricsGrid = 'lg:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(9rem,0.9fr)_8.5rem_minmax(12rem,1.1fr)_2.5rem]';

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-bold uppercase text-slate-500 lg:hidden">{children}</p>;
}

export function ProcessMetricsEditor({ action, processId, roleOptions, rows: initialRows }: Props) {
  const nextLocalId = useRef(0);
  const [rows, setRows] = useState<EditableMetric[]>(() => initialRows.map((row) => ({
    formula: row.formula ?? '',
    frequency: row.frequency ?? '',
    id: row.id,
    localId: `saved:${row.id}`,
    name: row.name,
    responsibleRoleIds: row.responsible_roles.map((role) => role.role_id),
    target: row.target ?? '',
  })));
  const [message, setMessage] = useState<string | null>(null);

  const saveBlock = useCallback(async () => {
    if (rows.some((row) => !row.name.trim())) {
      const error = 'Ingresa el nombre de cada indicador.';
      setMessage(error);
      return { data: null, error };
    }

    const result = await action(processId, rows.map(({ localId: _localId, ...row }) => row));
    if (result.error || !result.data) {
      const error = result.error ?? 'No se pudieron guardar los indicadores.';
      setMessage(error);
      return { data: null, error };
    }
    setRows((current) => current.map((row, index) => ({ ...row, id: result.data?.[index]?.id ?? row.id })));
    setMessage(null);
    return result;
  }, [action, processId, rows]);
  const { markDirty } = useProcessMasterSaveSection({
    id: 'metrics',
    label: 'Indicadores y objetivos',
    save: saveBlock,
  });

  function addRow() {
    nextLocalId.current += 1;
    setRows((current) => [...current, {
      formula: '',
      frequency: '',
      id: null,
      localId: `new:${nextLocalId.current}`,
      name: '',
      responsibleRoleIds: [],
      target: '',
    }]);
    setMessage(null);
    markDirty();
  }

  function updateRow(localId: string, values: Partial<EditableMetric>) {
    setRows((current) => current.map((row) => row.localId === localId ? { ...row, ...values } : row));
    setMessage(null);
    markDirty();
  }

  function removeRow(localId: string) {
    setRows((current) => current.filter((row) => row.localId !== localId));
    setMessage(null);
    markDirty();
  }

  return (
    <div>
      {rows.length ? <div className={`hidden gap-3 border-b border-[#e7edf2] bg-[#f8fafb] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 lg:grid ${metricsGrid}`}>
        <span>Indicador</span><span>Formula / criterio</span><span>Meta</span><span>Frecuencia</span><span>Responsable</span><span aria-hidden="true" />
      </div> : null}
      {rows.map((row) => (
        <div className={`relative grid gap-3 border-b border-[#e7edf2] px-4 py-3 pr-12 last:border-b-0 lg:items-start lg:pr-4 lg:grid ${metricsGrid}`} key={row.localId}>
          <div><MobileLabel>Indicador</MobileLabel><textarea aria-label="Indicador" className={fieldClass} onChange={(event) => updateRow(row.localId, { name: event.target.value })} value={row.name} /></div>
          <div><MobileLabel>Formula / criterio</MobileLabel><textarea aria-label="Formula / criterio" className={fieldClass} onChange={(event) => updateRow(row.localId, { formula: event.target.value })} value={row.formula} /></div>
          <div><MobileLabel>Meta</MobileLabel><textarea aria-label="Meta" className={fieldClass} onChange={(event) => updateRow(row.localId, { target: event.target.value })} value={row.target} /></div>
          <div><MobileLabel>Frecuencia</MobileLabel><select aria-label="Frecuencia" className={selectClass} onChange={(event) => updateRow(row.localId, { frequency: event.target.value })} value={row.frequency}>{frequencies.map((frequency) => <option key={frequency || 'empty'} value={frequency}>{frequency || 'Sin definir'}</option>)}</select></div>
          <div><MobileLabel>Responsable</MobileLabel><ProcessMultiRoleSelector ariaLabel={`Responsables de ${row.name || 'indicador'}`} onChange={(responsibleRoleIds) => updateRow(row.localId, { responsibleRoleIds })} options={roleOptions} selectedRoleIds={row.responsibleRoleIds} /></div>
          <button aria-label="Eliminar indicador" className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-slate-500 transition hover:border-[#e5b6b6] hover:bg-[#fff7f7] hover:text-[#9b3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea lg:static lg:mt-5 lg:justify-self-center" onClick={() => removeRow(row.localId)} title="Eliminar indicador" type="button"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-[#e7edf2] bg-[#fbfcfd] px-4 py-3 sm:flex-row sm:items-center">
        <button className="text-sm font-bold text-sea transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea" onClick={addRow} type="button">+ Agregar indicador</button>
        {message ? <p aria-live="polite" className="text-sm text-[#9b3434] sm:ml-auto">{message}</p> : null}
      </div>
    </div>
  );
}