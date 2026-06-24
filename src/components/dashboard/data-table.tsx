import { SearchX } from "lucide-react";

export type TableAlign = "left" | "right" | "center";

const alignClasses: Record<TableAlign, string> = {
  center: "text-center",
  left: "text-left",
  right: "text-right",
};

export function DataTable({
  children,
  minWidth = "1100px",
}: {
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_18px_rgba(2,53,116,0.035)]">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[0.92rem]" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-[#f7fafc]">{children}</thead>;
}

export function DataTableHeaderCell({
  align = "left",
  children,
}: {
  align?: TableAlign;
  children: React.ReactNode;
}) {
  return (
    <th
      className={`border-b border-[#d6e1ea] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 ${alignClasses[align]}`}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[#edf2f6] bg-white">{children}</tbody>;
}

export function DataTableRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="transition odd:bg-white even:bg-[#fbfcfd] hover:bg-[#f3f9fc]">
      {children}
    </tr>
  );
}

export function DataTableCell({
  align = "left",
  children,
  strong = false,
}: {
  align?: TableAlign;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`max-w-[300px] px-4 py-3 align-top leading-6 text-slate-700 ${alignClasses[align]} ${
        strong ? "font-bold text-navy" : ""
      }`}
    >
      {children}
    </td>
  );
}

export function EmptyState({
  description = "No hay datos para mostrar con los filtros actuales.",
  title = "Sin resultados",
}: {
  description?: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-mist px-6 py-10 text-center">
      <SearchX className="mx-auto h-8 w-8 text-slate-400" />
      <p className="mt-3 font-semibold text-navy">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}
