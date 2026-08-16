"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Archive, ChevronDown, GripVertical, Plus, Save } from "lucide-react";

import { useProcessMasterReadinessUpdater } from "@/app/procesos/process-master/process-master-save-coordinator";

import {
  addSubprocessToProcess,
  deleteSubprocess,
  reorderSubprocesses,
  updateSubprocessDetail,
} from "@/app/admin/actions";

type StageRow = {
  subprocess_id: string;
  subprocess_name: string;
  subprocess_description: string | null;
  sort_order: number | null;
};

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PrimaryButton({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] disabled:cursor-wait disabled:opacity-60"
      disabled={disabled}
      type="submit"
    >
      <Save className="h-4 w-4 text-clay" />
      {children}
    </button>
  );
}

function moveItem(items: StageRow[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((item, index) => ({
    ...item,
    sort_order: index + 1,
  }));
}

export function StageEditor({
  initiallyOpen = false,
  initialRows,
  nextSortOrder,
  processId,
}: {
  initiallyOpen?: boolean;
  initialRows: StageRow[];
  nextSortOrder: number;
  processId: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const addDetailsRef = useRef<HTMLDetailsElement>(null);
  const updateReadinessSnapshot = useProcessMasterReadinessUpdater();

  useLayoutEffect(() => {
    if (!initiallyOpen) return;
    const storageKey = `process-draft-scroll:${processId}:stage`;
    const storedPosition = sessionStorage.getItem(storageKey);
    if (storedPosition === null) return;
    sessionStorage.removeItem(storageKey);

    const scrollPosition = Number(storedPosition);
    if (!Number.isFinite(scrollPosition)) return;

    window.scrollTo(0, scrollPosition);
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, scrollPosition);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initiallyOpen, processId]);

  useEffect(() => {
    if (initiallyOpen && addDetailsRef.current) addDetailsRef.current.open = true;
  }, [initiallyOpen]);

  useEffect(() => {
    updateReadinessSnapshot?.({ activeStageCount: rows.length });
  }, [rows.length, updateReadinessSnapshot]);

  function saveOrder(nextRows: StageRow[]) {
    setMessage("Guardando orden...");
    startTransition(async () => {
      const result = await reorderSubprocesses(
        processId,
        nextRows.map((row) => row.subprocess_id),
      );
      setMessage(result.error ? result.error : "Orden actualizado");
    });
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }

    const nextRows = moveItem(rows, dragIndex, targetIndex);
    setRows(nextRows);
    setDragIndex(null);
    saveOrder(nextRows);
  }

  function handleUpdateStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setMessage("Guardando etapa...");
    startTransition(async () => {
      const result = await updateSubprocessDetail(formData);
      if (result.error || !result.stage) {
        setMessage(result.error ?? "No se pudo actualizar la etapa.");
        return;
      }
      setRows((currentRows) => currentRows.map((row) => row.subprocess_id === result.stage?.subprocess_id ? result.stage : row));
      setMessage("Etapa actualizada");
    });
  }

  function handleArchiveStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const subprocessId = String(formData.get("subprocess_id") ?? "");

    setMessage("Archivando etapa...");
    startTransition(async () => {
      const result = await deleteSubprocess(formData);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setRows((currentRows) => currentRows.filter((row) => row.subprocess_id !== subprocessId));
      setMessage("Etapa archivada");
    });
  }
  function handleAddStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setMessage("Guardando etapa...");
    startTransition(async () => {
      const result = await addSubprocessToProcess(formData);

      if (result.error || !result.stage) {
        setMessage(result.error ?? "No se pudo crear la etapa.");
        return;
      }

      setRows((currentRows) => [...currentRows, result.stage]);
      form.reset();
      if (addDetailsRef.current) addDetailsRef.current.open = false;
      setMessage("Etapa agregada");
    });
  }

  return (
    <div aria-label="Actividades clave / Etapas" className="min-w-0">
      {isPending || message ? <p aria-live="polite" className="pb-2 text-right text-xs font-semibold text-sea">{isPending ? "Guardando..." : message}</p> : null}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            className="overflow-hidden rounded-md border border-line bg-white"
            key={row.subprocess_id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
          >
            <details className="group">
              <summary className="cursor-pointer list-none px-3 py-2.5 transition hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-inset">
                <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-2">
                  <span
                    aria-label={`Arrastrar etapa ${row.subprocess_name}`}
                    className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border border-line bg-white text-slate-500 active:cursor-grabbing"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    title="Arrastrar etapa"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 text-sm font-bold text-navy">
                    <span className="mr-2 text-sea">{row.sort_order ?? index + 1}.</span>
                    {row.subprocess_name}
                  </span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                </div>
              </summary>

              <div className="border-t border-line bg-[#fbfdfe] p-4">
                <form className="grid gap-4" onSubmit={handleUpdateStage}>
                  <input name="process_id" type="hidden" value={processId} />
                  <input name="subprocess_id" type="hidden" value={row.subprocess_id} />
                  <input name="sort_order" type="hidden" value={row.sort_order ?? index + 1} />
                  <Field label="Nombre de la etapa">
                    <input className={inputClass} name="name" required defaultValue={row.subprocess_name} />
                  </Field>
                  <Field label="Descripcion">
                    <textarea className={`${inputClass} min-h-24`} name="description" defaultValue={row.subprocess_description ?? ""} />
                  </Field>
                  <div><PrimaryButton disabled={isPending}>{isPending ? "Guardando..." : "Guardar etapa"}</PrimaryButton></div>
                </form>

                <form className="mt-4 border-t border-line pt-4" onSubmit={handleArchiveStage}>
                  <input name="process_id" type="hidden" value={processId} />
                  <input name="subprocess_id" type="hidden" value={row.subprocess_id} />
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-[#ffd6b0] bg-[#fff7ef] px-4 py-2 text-sm font-bold text-[#86510d] transition hover:bg-[#ffe6ca]"
                    type="submit"
                  >
                    <Archive className="h-4 w-4" />
                    Archivar etapa
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    Esto oculta la etapa del editor y la ficha normal, conservando sus relaciones historicas.
                  </p>
                </form>
              </div>
            </details>
          </div>
        ))}

        <details className="overflow-hidden rounded-md border border-dashed border-line bg-[#fbfdfe]" ref={addDetailsRef}>
          <summary className="cursor-pointer list-none px-3 py-3 transition hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-inset">
            <div className="flex items-center gap-2 font-bold text-navy">
              <Plus className="h-4 w-4 text-sea" />
              Agregar etapa
            </div>
          </summary>
          <form className="grid gap-4 border-t border-line bg-white p-4" onSubmit={handleAddStage}>
            <input name="process_id" type="hidden" value={processId} />
            <input name="sort_order" type="hidden" value={Math.max(nextSortOrder, ...rows.map((row) => (row.sort_order ?? 0) + 1))} />
            <Field label="Nombre de la etapa">
              <input className={inputClass} name="name" required />
            </Field>
            <Field label="Descripcion">
              <textarea className={`${inputClass} min-h-24`} name="description" />
            </Field>
            <div><PrimaryButton>Agregar etapa</PrimaryButton></div>
          </form>
        </details>
      </div>
    </div>
  );
}
