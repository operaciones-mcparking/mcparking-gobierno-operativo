'use client';

import { X } from 'lucide-react';

export type ProcessResponsibleRoleOption = {
  id: string;
  name: string;
};

type Props = {
  ariaLabel: string;
  onChange: (roleIds: string[]) => void;
  options: ProcessResponsibleRoleOption[];
  selectedRoleIds: string[];
};

export function ProcessMultiRoleSelector({ ariaLabel, onChange, options, selectedRoleIds }: Props) {
  const optionById = new Map(options.map((option) => [option.id, option]));
  const availableOptions = options.filter((option) => !selectedRoleIds.includes(option.id));

  function addRole(roleId: string) {
    if (!roleId || selectedRoleIds.includes(roleId)) return;
    onChange([...selectedRoleIds, roleId]);
  }

  function removeRole(roleId: string) {
    onChange(selectedRoleIds.filter((selectedId) => selectedId !== roleId));
  }

  return (
    <div className="grid gap-2">
      {selectedRoleIds.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedRoleIds.map((roleId) => {
            const role = optionById.get(roleId);
            if (!role) return null;
            return (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-[#cbd8e3] bg-[#f6f9fb] py-1 pl-2.5 pr-1 text-xs font-semibold text-navy" key={roleId}>
                <span className="min-w-0 truncate">{role.name}</span>
                <button
                  aria-label={`Quitar responsable ${role.name}`}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-[#9b3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                  onClick={() => removeRole(roleId)}
                  title="Quitar responsable"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
      <select
        aria-label={ariaLabel}
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-sea/20"
        disabled={!availableOptions.length}
        onChange={(event) => {
          addRole(event.target.value);
          event.target.value = '';
        }}
        value=""
      >
        <option value="">{availableOptions.length ? '+ Agregar responsable' : 'Sin roles disponibles'}</option>
        {availableOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
      </select>
    </div>
  );
}