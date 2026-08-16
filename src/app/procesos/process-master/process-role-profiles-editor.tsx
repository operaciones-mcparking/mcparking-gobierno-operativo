'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import type { ProcessMasterRoleProfile } from './process-master-types';
import { MobileRoleLabel } from './process-role-profiles-table';
import { useProcessMasterSaveSection } from './process-master-save-coordinator';

type RoleOption = { id: string; name: string };
type EditableRoleProfile = {
  accountability: string;
  authority: string;
  localId: string;
  profileId: string | null;
  responsibility: string;
  roleId: string;
};
type SavedRoleProfile = { clientId: string; id: string };
type SaveResult = { data: SavedRoleProfile[] | null; error: string | null };
type Props = {
  action: (processId: string, rows: Array<{
    accountability: string;
    authority: string;
    clientId: string;
    profileId: string | null;
    responsibility: string;
    roleId: string;
    sortOrder: number;
  }>) => Promise<SaveResult>;
  initiallyAddRow?: boolean;
  processId: string;
  roleOptions: RoleOption[];
  rows: ProcessMasterRoleProfile[];
};

const textareaClass = 'h-[72px] min-h-[72px] w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20';
const selectClass = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20';
const roleProfileEditorGrid = 'lg:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.04fr)_minmax(12rem,1.04fr)_minmax(12rem,1.04fr)_2.5rem]';

export function ProcessRoleProfilesEditor({ action, initiallyAddRow = false, processId, roleOptions, rows: initialRows }: Props) {
  const nextLocalId = useRef(initiallyAddRow ? 1 : 0);
  const [rows, setRows] = useState<EditableRoleProfile[]>(() => {
    const loadedRows = initialRows.map((row) => ({
      accountability: row.accountability ?? '',
      authority: row.authority ?? '',
      localId: `saved:${row.id}`,
      profileId: row.id,
      responsibility: row.responsibility ?? '',
      roleId: row.role_id,
    }));
    return initiallyAddRow ? [...loadedRows, {
      accountability: '',
      authority: '',
      localId: 'new:initial',
      profileId: null,
      responsibility: '',
      roleId: '',
    }] : loadedRows;
  });
  const [message, setMessage] = useState<string | null>(null);

  const saveBlock = useCallback(async () => {
    if (rows.some((row) => !row.roleId)) {
      const error = 'Selecciona un rol oficial en cada fila.';
      setMessage(error);
      return { data: null, error };
    }

    const result = await action(processId, rows.map((row, sortOrder) => ({
      accountability: row.accountability,
      authority: row.authority,
      clientId: row.localId,
      profileId: row.profileId,
      responsibility: row.responsibility,
      roleId: row.roleId,
      sortOrder,
    })));
    if (!result.error && result.data) {
      const savedByClientId = new Map(result.data.map((profile) => [profile.clientId, profile.id]));
      setRows((current) => current.map((row) => {
        const profileId = savedByClientId.get(row.localId) ?? row.profileId;
        return profileId ? { ...row, localId: `saved:${profileId}`, profileId } : row;
      }));
    }
    setMessage(result.error);
    return result;
  }, [action, processId, rows]);
  const { markDirty } = useProcessMasterSaveSection({
    id: 'roles',
    label: 'Roles, responsabilidades y autoridad',
    save: saveBlock,
  });

  useLayoutEffect(() => {
    if (!initiallyAddRow) return;
    const storageKey = `process-draft-scroll:${processId}:role`;
    const storedPosition = sessionStorage.getItem(storageKey);
    if (storedPosition === null) return;
    sessionStorage.removeItem(storageKey);

    const scrollPosition = Number(storedPosition);
    if (!Number.isFinite(scrollPosition)) return;
    window.scrollTo(0, scrollPosition);
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, scrollPosition));
    return () => window.cancelAnimationFrame(frame);
  }, [initiallyAddRow, processId]);

  function addRow() {
    nextLocalId.current += 1;
    setRows((current) => [...current, {
      accountability: '',
      authority: '',
      localId: `new:${nextLocalId.current}`,
      profileId: null,
      responsibility: '',
      roleId: '',
    }]);
    setMessage(null);
    markDirty();
  }

  function updateRow(localId: string, field: keyof Omit<EditableRoleProfile, 'localId' | 'profileId'>, value: string) {
    setRows((current) => current.map((row) => row.localId === localId ? { ...row, [field]: value } : row));
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
      {rows.length ? <div className={'hidden gap-3 border-b border-[#e7edf2] bg-[#f8fafb] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 lg:grid ' + roleProfileEditorGrid}>
        <span>Rol</span><span>Responsabilidad</span><span>Autoridad</span><span>{'Rendici\u00f3n de cuentas'}</span><span aria-hidden={'true'} />
      </div> : null}

      {rows.map((row) => (
        <div className={'relative grid gap-3 border-b border-[#e7edf2] px-4 py-3 pr-12 last:border-b-0 lg:items-center lg:pr-4 lg:grid ' + roleProfileEditorGrid} key={row.localId}>
          <div>
            <MobileRoleLabel>Rol</MobileRoleLabel>
            <select aria-label={'Rol oficial'} className={selectClass} onChange={(event) => updateRow(row.localId, 'roleId', event.target.value)} value={row.roleId}>
              <option disabled value={''}>Selecciona un rol</option>
              {roleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <ProfileTextarea label={'Responsabilidad'} onChange={(value) => updateRow(row.localId, 'responsibility', value)} value={row.responsibility} />
          <ProfileTextarea label={'Autoridad'} onChange={(value) => updateRow(row.localId, 'authority', value)} value={row.authority} />
          <ProfileTextarea label={'Rendici\u00f3n de cuentas'} onChange={(value) => updateRow(row.localId, 'accountability', value)} value={row.accountability} />
          <button aria-label={'Eliminar fila de rol'} className={'absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-slate-500 transition hover:border-[#e5b6b6] hover:bg-[#fff7f7] hover:text-[#9b3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea lg:static lg:justify-self-center lg:self-center'} onClick={() => removeRow(row.localId)} title={'Eliminar rol'} type={'button'}>
            <Trash2 className={'h-4 w-4'} />
          </button>
        </div>
      ))}
      <div className={'flex flex-col gap-2 border-t border-[#e7edf2] bg-[#fbfcfd] px-4 py-3 sm:flex-row sm:items-center'}>
        <button className={'text-sm font-bold text-sea transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea'} onClick={addRow} type={'button'}>+ Agregar rol</button>
        {message ? <p aria-live={'polite'} className={'text-sm text-[#9b3434] sm:ml-auto'}>{message}</p> : null}
      </div>
    </div>
  );
}

function ProfileTextarea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div>
      <MobileRoleLabel>{label}</MobileRoleLabel>
      <textarea aria-label={label} className={textareaClass} onChange={(event) => onChange(event.target.value)} value={value} />
    </div>
  );
}