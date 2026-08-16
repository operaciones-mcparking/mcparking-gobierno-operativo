'use client';

import { useCallback, useRef, useState } from 'react';

import {
  useProcessMasterReadinessUpdater,
  useProcessMasterSaveSection,
} from './process-master-save-coordinator';
import type { ProcessActivationSnapshot } from './process-master-validation';

type Props = {
  action: (formData: FormData) => Promise<{ error: string | null }>;
  children: React.ReactNode;
  className?: string;
  sectionId: string;
  sectionLabel: string;
  readinessFields?: Partial<Record<string, keyof ProcessActivationSnapshot>>;
};

export function ProcessSectionForm({ action, children, className, readinessFields, sectionId, sectionLabel }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const updateReadinessSnapshot = useProcessMasterReadinessUpdater();

  const saveSection = useCallback(async () => {
    if (!formRef.current) return { error: `No se pudo preparar ${sectionLabel}.` };
    const result = await action(new FormData(formRef.current));
    setMessage(result.error);
    return result;
  }, [action, sectionLabel]);
  const { markDirty } = useProcessMasterSaveSection({ id: sectionId, label: sectionLabel, save: saveSection });

  return (
    <form
      className={className}
      onChange={(event) => {
        setMessage(null);
        markDirty();
        if (!readinessFields || !updateReadinessSnapshot) return;
        const formData = new FormData(event.currentTarget);
        const patch: Partial<ProcessActivationSnapshot> = {};
        for (const [formField, snapshotField] of Object.entries(readinessFields) as Array<[string, keyof ProcessActivationSnapshot]>) {
          const value = formData.get(formField);
          if (typeof value === 'string') Object.assign(patch, { [snapshotField]: value });
        }
        updateReadinessSnapshot(patch);
      }}
      onSubmit={(event) => event.preventDefault()}
      ref={formRef}
    >
      {children}
      {message ? <p aria-live="polite" className="px-4 pb-3 text-sm text-[#9b3434] sm:px-5">{message}</p> : null}
    </form>
  );
}