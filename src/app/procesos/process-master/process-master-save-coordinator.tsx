'use client';

import { Save } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  evaluateProcessActivationReadiness,
  getProcessActivationCompleteness,
  type ProcessActivationSnapshot,
} from './process-master-validation';

type SaveResult = { error: string | null };
type SectionRegistration = {
  id: string;
  label: string;
  save: () => Promise<SaveResult>;
};
type SaveContextValue = {
  dirtyIds: ReadonlySet<string>;
  feedback: string | null;
  hasChanges: boolean;
  isFinalStep: boolean;
  isSaving: boolean;
  markDirty: (id: string) => void;
  readinessSnapshot: ProcessActivationSnapshot;
  registerSection: (section: SectionRegistration) => () => void;
  saveFicha: () => Promise<void>;
  setWizardPosition: (currentStep: number, totalSteps: number) => void;
  updateReadinessSnapshot: (patch: Partial<ProcessActivationSnapshot>) => void;
};

const ProcessMasterSaveContext = createContext<SaveContextValue | null>(null);
const emptyDirtySections = new Set<string>();

export function ProcessMasterSaveCoordinator({
  children,
  initialActivationSnapshot,
}: {
  children: React.ReactNode;
  initialActivationSnapshot: ProcessActivationSnapshot;
}) {
  const sectionsRef = useRef(new Map<string, SectionRegistration>());
  const versionsRef = useRef(new Map<string, number>());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isFinalStep, setIsFinalStep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [readinessSnapshot, setReadinessSnapshot] = useState(initialActivationSnapshot);

  const registerSection = useCallback((section: SectionRegistration) => {
    sectionsRef.current.set(section.id, section);
    return () => {
      sectionsRef.current.delete(section.id);
      versionsRef.current.delete(section.id);
      setDirtyIds((current) => {
        if (!current.has(section.id)) return current;
        const next = new Set(current);
        next.delete(section.id);
        return next;
      });
    };
  }, []);

  const markDirty = useCallback((id: string) => {
    versionsRef.current.set(id, (versionsRef.current.get(id) ?? 0) + 1);
    setDirtyIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setFeedback(null);
  }, []);

  const updateReadinessSnapshot = useCallback((patch: Partial<ProcessActivationSnapshot>) => {
    setReadinessSnapshot((current) => ({ ...current, ...patch }));
  }, []);

  const setWizardPosition = useCallback((currentStep: number, totalSteps: number) => {
    setIsFinalStep(currentStep === totalSteps);
  }, []);

  const saveFicha = useCallback(async () => {
    if (isSaving || dirtyIds.size === 0) return;
    setIsSaving(true);
    setFeedback(null);

    const failures: string[] = [];
    for (const id of dirtyIds) {
      const section = sectionsRef.current.get(id);
      if (!section) continue;
      const versionAtStart = versionsRef.current.get(id) ?? 0;

      try {
        const result = await section.save();
        if (result.error) {
          failures.push(section.label);
          continue;
        }
        setDirtyIds((current) => {
          if ((versionsRef.current.get(id) ?? 0) !== versionAtStart || !current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      } catch {
        failures.push(section.label);
      }
    }

    setFeedback(
      failures.length
        ? `Se guard\u00f3 parcialmente. Revisa: ${failures.join(', ')}.`
        : '\u2713 Ficha guardada',
    );
    setIsSaving(false);
  }, [dirtyIds, isSaving]);

  const hasChanges = dirtyIds.size > 0;
  const contextValue = useMemo(() => ({
    dirtyIds,
    feedback,
    hasChanges,
    isFinalStep,
    isSaving,
    markDirty,
    readinessSnapshot,
    registerSection,
    saveFicha,
    setWizardPosition,
    updateReadinessSnapshot,
  }), [dirtyIds, feedback, hasChanges, isFinalStep, isSaving, markDirty, readinessSnapshot, registerSection, saveFicha, setWizardPosition, updateReadinessSnapshot]);

  return (
    <ProcessMasterSaveContext.Provider value={contextValue}>
      <div className="sticky top-3 z-30 mt-5 rounded-lg border border-[#d6e1ea] bg-white/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,59,92,0.08)] backdrop-blur sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${hasChanges ? 'text-navy' : 'text-slate-500'}`}>
              {isSaving ? 'Guardando ficha...' : hasChanges ? 'Cambios sin guardar' : 'Ficha guardada'}
            </p>
            {feedback ? <p aria-live="polite" className="mt-0.5 text-xs text-slate-600">{feedback}</p> : null}
          </div>
          {!isFinalStep ? (
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${hasChanges ? 'bg-navy text-white hover:bg-[#075077]' : 'cursor-not-allowed border border-[#d6e1ea] bg-[#f4f7f9] text-slate-400'}`}
              disabled={!hasChanges || isSaving}
              onClick={() => void saveFicha()}
              type="button"
            >
              <Save className={`h-4 w-4 ${hasChanges ? 'text-clay' : 'text-slate-400'}`} />
              {isSaving ? 'Guardando ficha...' : 'Guardar ficha'}
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </ProcessMasterSaveContext.Provider>
  );
}

export function useProcessMasterSaveSection(section: SectionRegistration) {
  const context = useContext(ProcessMasterSaveContext);
  const saveRef = useRef(section.save);
  saveRef.current = section.save;

  if (!context) {
    throw new Error('useProcessMasterSaveSection must be used inside ProcessMasterSaveCoordinator.');
  }

  const { markDirty, registerSection } = context;
  const sectionId = section.id;
  const sectionLabel = section.label;

  useEffect(() => registerSection({
    id: sectionId,
    label: sectionLabel,
    save: () => saveRef.current(),
  }), [registerSection, sectionId, sectionLabel]);

  return { markDirty: () => markDirty(sectionId) };
}

export function useProcessMasterDirtySections(): ReadonlySet<string> {
  return useContext(ProcessMasterSaveContext)?.dirtyIds ?? emptyDirtySections;
}

export function useProcessMasterSaveState() {
  const context = useContext(ProcessMasterSaveContext);
  if (!context) return null;
  return {
    feedback: context.feedback,
    hasChanges: context.hasChanges,
    isSaving: context.isSaving,
    saveFicha: context.saveFicha,
  };
}

export function useProcessMasterReadiness() {
  const context = useContext(ProcessMasterSaveContext);
  if (!context) throw new Error('useProcessMasterReadiness must be used inside ProcessMasterSaveCoordinator.');
  const validation = evaluateProcessActivationReadiness(context.readinessSnapshot);
  return {
    completeness: getProcessActivationCompleteness(validation),
    hasChanges: context.hasChanges,
    isSaving: context.isSaving,
    validation,
  };
}

export function useProcessMasterReadinessUpdater() {
  return useContext(ProcessMasterSaveContext)?.updateReadinessSnapshot ?? null;
}

export function useProcessMasterWizardPosition() {
  return useContext(ProcessMasterSaveContext)?.setWizardPosition ?? null;
}