'use client';

import { LoaderCircle, Save } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  evaluateProcessActivationReadiness,
  getProcessActivationCompleteness,
  type ProcessActivationSnapshot,
} from './process-master-validation';

type SaveResult = { error: string | null };
type SaveOverlayState = 'idle' | 'saving' | 'saved-ready';
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
  registerActivationPrompt: (handler: () => void) => () => void;
  registerSection: (section: SectionRegistration) => () => void;
  saveFicha: () => Promise<void>;
  setWizardPosition: (currentStep: number, totalSteps: number) => void;
  updateReadinessSnapshot: (patch: Partial<ProcessActivationSnapshot>) => void;
};

const ProcessMasterSaveContext = createContext<SaveContextValue | null>(null);
const emptyDirtySections = new Set<string>();

export function ProcessMasterSaveCoordinator({
  canOfferActivation,
  children,
  initialActivationSnapshot,
}: {
  canOfferActivation: boolean;
  children: React.ReactNode;
  initialActivationSnapshot: ProcessActivationSnapshot;
}) {
  const sectionsRef = useRef(new Map<string, SectionRegistration>());
  const activationPromptRef = useRef<(() => void) | null>(null);
  const saveInFlightRef = useRef(false);
  const versionsRef = useRef(new Map<string, number>());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isFinalStep, setIsFinalStep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [overlayState, setOverlayState] = useState<SaveOverlayState>('idle');
  const [readinessSnapshot, setReadinessSnapshot] = useState(initialActivationSnapshot);

  const registerActivationPrompt = useCallback((handler: () => void) => {
    activationPromptRef.current = handler;
    return () => {
      if (activationPromptRef.current === handler) activationPromptRef.current = null;
    };
  }, []);

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
    if (saveInFlightRef.current || isSaving || dirtyIds.size === 0) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setOverlayState('saving');
    setFeedback(null);

    const failures: string[] = [];
    let hasConcurrentChanges = false;
    let showSavedReady = false;
    try {
      for (const id of dirtyIds) {
        const section = sectionsRef.current.get(id);
        if (!section) {
          hasConcurrentChanges = true;
          continue;
        }
        const versionAtStart = versionsRef.current.get(id) ?? 0;

        try {
          const result = await section.save();
          if (result.error) {
            failures.push(section.label);
            continue;
          }
          if ((versionsRef.current.get(id) ?? 0) !== versionAtStart) {
            hasConcurrentChanges = true;
            continue;
          }
          setDirtyIds((current) => {
            if (!current.has(id)) return current;
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        } catch {
          failures.push(section.label);
        }
      }

      showSavedReady = canOfferActivation
        && failures.length === 0
        && !hasConcurrentChanges
        && evaluateProcessActivationReadiness(readinessSnapshot).isValid;
      setFeedback(
        failures.length
          ? `Se guard\u00f3 parcialmente. Revisa: ${failures.join(', ')}.`
          : '\u2713 Ficha guardada',
      );
    } catch {
      setFeedback('No se pudo guardar la ficha. Intenta nuevamente.');
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      setOverlayState(showSavedReady ? 'saved-ready' : 'idle');
    }
  }, [canOfferActivation, dirtyIds, isSaving, readinessSnapshot]);

  const hasChanges = dirtyIds.size > 0;
  const contextValue = useMemo(() => ({
    dirtyIds,
    feedback,
    hasChanges,
    isFinalStep,
    isSaving,
    markDirty,
    readinessSnapshot,
    registerActivationPrompt,
    registerSection,
    saveFicha,
    setWizardPosition,
    updateReadinessSnapshot,
  }), [dirtyIds, feedback, hasChanges, isFinalStep, isSaving, markDirty, readinessSnapshot, registerActivationPrompt, registerSection, saveFicha, setWizardPosition, updateReadinessSnapshot]);

  return (
    <ProcessMasterSaveContext.Provider value={contextValue}>
      {overlayState !== 'idle' ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/20 px-4 backdrop-blur-[1px]"
          role="status"
        >
          <div className="w-full max-w-sm rounded-lg border border-[#d6e1ea] bg-white px-6 py-7 text-center shadow-[0_18px_50px_rgba(0,59,92,0.22)]">
            {overlayState === 'saving' ? (
              <>
                <LoaderCircle aria-hidden="true" className="mx-auto h-9 w-9 animate-spin text-sea" />
                <p className="mt-4 text-base font-bold text-navy">Guardando ficha...</p>
                <p className="mt-1 text-sm text-slate-600">Por favor espera, no cierres esta página.</p>
              </>
            ) : (
              <>
                <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e4f4ea] text-xl font-bold text-[#247a4b]" aria-hidden="true">✓</span>
                <p className="mt-4 text-base font-bold text-navy">Ficha guardada correctamente</p>
                <p className="mt-1 text-sm text-slate-600">El proceso está completo y listo para activarse.</p>
                <div className="mt-5 grid gap-2">
                  <button
                    className="rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                    onClick={() => {
                      setOverlayState('idle');
                      activationPromptRef.current?.();
                    }}
                    type="button"
                  >
                    Activar proceso
                  </button>
                  <button
                    className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                    onClick={() => setOverlayState('idle')}
                    type="button"
                  >
                    Activar después
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      <div
        aria-busy={isSaving}
        className={overlayState !== 'idle' ? 'pointer-events-none select-none' : undefined}
        inert={overlayState !== 'idle'}
      >
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
      </div>
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

export function useProcessMasterActivationPrompt() {
  const context = useContext(ProcessMasterSaveContext);
  if (!context) throw new Error('useProcessMasterActivationPrompt must be used inside ProcessMasterSaveCoordinator.');
  return context.registerActivationPrompt;
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