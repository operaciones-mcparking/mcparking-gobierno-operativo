'use client';

import { Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { ProcessMultiRoleSelector, type ProcessResponsibleRoleOption } from './process-multi-role-selector';
import { useProcessMasterSaveSection } from './process-master-save-coordinator';
import type { ProcessMasterRisk, ProcessRiskControlSaveRow } from './process-master-types';

type SaveResult = { data: ProcessRiskControlSaveRow[] | null; error: string | null };
type Props = {
  action: (processId: string, rows: ProcessRiskControlSaveRow[]) => Promise<SaveResult>;
  processId: string;
  roleOptions: ProcessResponsibleRoleOption[];
  rows: ProcessMasterRisk[];
};
type EditableRiskControl = ProcessRiskControlSaveRow & { localId: string };

const fieldClass = 'h-[72px] min-h-[72px] w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20';
const selectClass = 'mb-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20';
const risksGrid = 'lg:grid-cols-[minmax(12rem,1.15fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(12rem,1.1fr)_2.5rem]';

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-bold uppercase text-slate-500 lg:hidden">{children}</p>;
}

function flattenRisks(risks: ProcessMasterRisk[]): EditableRiskControl[] {
  return risks.flatMap((risk) => risk.controls.map((control) => ({
    controlId: control.id,
    controlName: control.name,
    evidence: control.evidence ?? '',
    localId: `saved:${control.id}`,
    responsibleRoleIds: control.responsible_roles.map((role) => role.role_id),
    riskId: risk.id,
    riskName: risk.name,
    riskType: risk.risk_type,
  })));
}

export function ProcessRisksControlsEditor({ action, processId, roleOptions, rows: initialRows }: Props) {
  const nextLocalId = useRef(0);
  const [rows, setRows] = useState<EditableRiskControl[]>(() => flattenRisks(initialRows));
  const [message, setMessage] = useState<string | null>(null);

  const saveBlock = useCallback(async () => {
    if (rows.some((row) => !row.riskName.trim() || !row.controlName.trim())) {
      const error = 'Completa el riesgo u oportunidad y su control en cada fila.';
      setMessage(error);
      return { data: null, error };
    }

    const result = await action(processId, rows.map(({ localId: _localId, ...row }) => row));
    if (result.error || !result.data) {
      const error = result.error ?? 'No se pudieron guardar los riesgos y controles.';
      setMessage(error);
      return { data: null, error };
    }
    setRows((current) => current.map((row, index) => ({
      ...row,
      controlId: result.data?.[index]?.controlId ?? row.controlId,
      riskId: result.data?.[index]?.riskId ?? row.riskId,
    })));
    setMessage(null);
    return result;
  }, [action, processId, rows]);
  const { markDirty } = useProcessMasterSaveSection({
    id: 'risks',
    label: 'Riesgos, controles y oportunidades',
    save: saveBlock,
  });

  function addRow() {
    nextLocalId.current += 1;
    setRows((current) => [...current, {
      controlId: null,
      controlName: '',
      evidence: '',
      localId: `new:${nextLocalId.current}`,
      responsibleRoleIds: [],
      riskId: null,
      riskName: '',
      riskType: 'risk',
    }]);
    setMessage(null);
    markDirty();
  }

  function updateRow(localId: string, values: Partial<EditableRiskControl>) {
    setRows((current) => {
      const source = current.find((row) => row.localId === localId);
      if (!source) return current;
      const updatesRiskDefinition = source.riskId && ('riskName' in values || 'riskType' in values);
      return current.map((row) => {
        if (row.localId === localId) return { ...row, ...values };
        return updatesRiskDefinition && row.riskId === source.riskId ? { ...row, ...values } : row;
      });
    });
    setMessage(null);
    markDirty();
  }

  function removeRow(localId: string) {
    setRows((current) => current.filter((row) => row.localId !== localId));
    setMessage(null);
    markDirty();
  }

  function selectExistingRisk(localId: string, riskId: string) {
    if (!riskId) {
      updateRow(localId, { riskId: null, riskName: '', riskType: 'risk' });
      return;
    }
    const source = rows.find((row) => row.riskId === riskId);
    if (!source) return;
    updateRow(localId, { riskId, riskName: source.riskName, riskType: source.riskType });
  }

  const existingRiskOptions = [...new Map(
    rows.flatMap((row) => row.riskId ? [[row.riskId, { id: row.riskId, name: row.riskName, type: row.riskType }] as const] : []),
  ).values()];

  return (
    <div>
      {rows.length ? <div className={`hidden gap-3 border-b border-[#e7edf2] bg-[#f8fafb] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 lg:grid ${risksGrid}`}>
        <span>Riesgo / oportunidad</span><span>Control</span><span>Evidencia</span><span>Responsable</span><span aria-hidden="true" />
      </div> : null}
      {rows.map((row) => (
        <div className={`relative grid gap-3 border-b border-[#e7edf2] px-4 py-3 pr-12 last:border-b-0 lg:items-start lg:pr-4 lg:grid ${risksGrid}`} key={row.localId}>
          <div>
            <MobileLabel>Riesgo / oportunidad</MobileLabel>
            {!row.controlId && existingRiskOptions.length ? (
              <select aria-label="Vincular control a riesgo existente" className={selectClass} onChange={(event) => selectExistingRisk(row.localId, event.target.value)} value={row.riskId ?? ''}>
                <option value="">Nuevo riesgo / oportunidad</option>
                {existingRiskOptions.map((risk) => <option key={risk.id} value={risk.id}>{risk.type === 'opportunity' ? 'Oportunidad' : 'Riesgo'}: {risk.name}</option>)}
              </select>
            ) : null}
            <select aria-label="Tipo" className={selectClass} onChange={(event) => updateRow(row.localId, { riskType: event.target.value === 'opportunity' ? 'opportunity' : 'risk' })} value={row.riskType}><option value="risk">Riesgo</option><option value="opportunity">Oportunidad</option></select>
            <textarea aria-label="Riesgo u oportunidad" className={fieldClass} onChange={(event) => updateRow(row.localId, { riskName: event.target.value })} value={row.riskName} />
          </div>
          <div><MobileLabel>Control</MobileLabel><textarea aria-label="Control" className={fieldClass} onChange={(event) => updateRow(row.localId, { controlName: event.target.value })} value={row.controlName} /></div>
          <div><MobileLabel>Evidencia</MobileLabel><textarea aria-label="Evidencia" className={fieldClass} onChange={(event) => updateRow(row.localId, { evidence: event.target.value })} value={row.evidence} /></div>
          <div><MobileLabel>Responsable</MobileLabel><ProcessMultiRoleSelector ariaLabel={`Responsables de ${row.controlName || 'control'}`} onChange={(responsibleRoleIds) => updateRow(row.localId, { responsibleRoleIds })} options={roleOptions} selectedRoleIds={row.responsibleRoleIds} /></div>
          <button aria-label="Eliminar control" className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-slate-500 transition hover:border-[#e5b6b6] hover:bg-[#fff7f7] hover:text-[#9b3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea lg:static lg:mt-5 lg:justify-self-center" onClick={() => removeRow(row.localId)} title="Eliminar control" type="button"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-[#e7edf2] bg-[#fbfcfd] px-4 py-3 sm:flex-row sm:items-center">
        <button className="text-sm font-bold text-sea transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea" onClick={addRow} type="button">+ Agregar riesgo / oportunidad</button>
        {message ? <p aria-live="polite" className="text-sm text-[#9b3434] sm:ml-auto">{message}</p> : null}
      </div>
    </div>
  );
}