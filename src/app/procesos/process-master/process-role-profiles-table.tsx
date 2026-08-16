import type { ProcessMasterRoleProfile } from './process-master-types';

export const roleProfileGrid = 'lg:grid-cols-[minmax(12rem,0.9fr)_minmax(14rem,1.1fr)_minmax(14rem,1.1fr)_minmax(14rem,1.1fr)]';

export function MobileRoleLabel({ children }: { children: React.ReactNode }) {
  return <p className={'mb-1 text-[11px] font-bold uppercase text-slate-500 lg:hidden'}>{children}</p>;
}

export function ProcessRoleProfilesReadonly({ rows }: { rows: ProcessMasterRoleProfile[] }) {
  if (!rows.length) {
    return <div className={'px-4 py-4 text-sm text-slate-600'}>Sin roles participantes documentados para este proceso.</div>;
  }
  const value = (text: string | null) => text?.trim() || 'No documentado';
  return (
    <div>
      <div className={'hidden gap-3 border-b border-line bg-[#f8fafb] px-4 py-2 text-xs font-bold uppercase text-slate-500 lg:grid ' + roleProfileGrid}>
        <span>Rol</span><span>Responsabilidad</span><span>Autoridad</span><span>{'Rendici\u00f3n de cuentas'}</span>
      </div>
      {rows.map((row) => (
        <div className={'grid gap-4 border-b border-line px-4 py-4 text-sm last:border-b-0 lg:gap-3 lg:grid ' + roleProfileGrid} key={row.id}>
          <div><MobileRoleLabel>Rol</MobileRoleLabel><p className={'font-bold text-navy'}>{row.role_name}</p></div>
          <div><MobileRoleLabel>Responsabilidad</MobileRoleLabel><p>{value(row.responsibility)}</p></div>
          <div><MobileRoleLabel>Autoridad</MobileRoleLabel><p>{value(row.authority)}</p></div>
          <div><MobileRoleLabel>{'Rendici\u00f3n de cuentas'}</MobileRoleLabel><p>{value(row.accountability)}</p></div>
        </div>
      ))}
    </div>
  );
}