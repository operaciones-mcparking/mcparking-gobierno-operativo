"use client";

import Link from "next/link";
import { FileText } from "lucide-react";

import type {
  ProcessCatalogV2Item,
  ProcessStageV2Row,
  RoleDictionaryItem,
} from "@/lib/dashboard/data";

type ProcessDetailLinkProps = {
  ownerRoleBySubprocess: Record<string, string>;
  process: ProcessCatalogV2Item;
  roleDictionary: RoleDictionaryItem[];
  stages: ProcessStageV2Row[];
};

export function ProcessDetailModal({ process }: ProcessDetailLinkProps) {
  return (
    <Link
      aria-label={`Ver ficha del proceso ${process.process_name}`}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#d6e1ea] bg-white px-3 text-xs font-medium text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
      href={`/procesos/${process.process_id}`}
      onClick={(event) => event.stopPropagation()}
      title="Ver ficha"
    >
      <FileText className="h-3.5 w-3.5" />
      Ver ficha
    </Link>
  );
}