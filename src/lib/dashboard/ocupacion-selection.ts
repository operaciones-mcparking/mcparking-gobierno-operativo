export const occupancySelectionStorageKey = "orquestador:ocupacion:parking-selection:v1";
export type OccupancyParkingSelection = {
  version: 1;
  physical: { known: string[]; selected: string[] };
  commercial: { known: string[]; selected: string[] };
};

function uniqueText(values: unknown) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) return null;
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function physicalParkingOrder(parking: string) {
  if (parking === "MC PARKING VESPUCIO") return 0;
  if (parking === "OKP TOTAL") return 1;
  if (parking.startsWith("NP ")) return 2;
  return 3;
}

export function availableOccupancyParkingNames(available: { physical: string[]; commercial: string[] }) {
  return {
    physical: (uniqueText(available.physical) ?? []).sort((left, right) => physicalParkingOrder(left) - physicalParkingOrder(right) || left.localeCompare(right)),
    commercial: uniqueText(available.commercial) ?? [],
  };
}


export function selectedAvailableOccupancyParkings(available: string[], selected: string[]) {
  const selectedSet = new Set(selected);
  return (uniqueText(available) ?? []).filter((parking) => selectedSet.has(parking));
}

export function emptyOccupancyParkingSelection(): OccupancyParkingSelection {
  return {
    version: 1,
    physical: { known: [], selected: [] },
    commercial: { known: [], selected: [] },
  };
}

export function parseOccupancyParkingSelection(raw: string | null): OccupancyParkingSelection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { version?: number; physical?: { known?: unknown; selected?: unknown }; commercial?: { known?: unknown; selected?: unknown } };
    if ((value.version !== 1 && value.version !== 2) || !value.physical || !value.commercial) return null;
    const legacyPhysicalKnown = uniqueText(value.physical.known);
    const legacyPhysicalSelected = uniqueText(value.physical.selected);
    const commercialKnown = uniqueText(value.commercial.known);
    const commercialSelected = uniqueText(value.commercial.selected);
    if (!legacyPhysicalKnown || !legacyPhysicalSelected || !commercialKnown || !commercialSelected) return null;
    const legacyOkpParkings = new Set(["OK PARKING EXPRESS", "OK PARKING RC"]);
    const hadKnownOkp = legacyPhysicalKnown.some((parking) => legacyOkpParkings.has(parking));
    const hadSelectedOkp = legacyPhysicalSelected.some((parking) => legacyOkpParkings.has(parking));
    const physicalKnown = legacyPhysicalKnown.filter((parking) => !legacyOkpParkings.has(parking));
    const physicalSelected = legacyPhysicalSelected.filter((parking) => !legacyOkpParkings.has(parking));
    if (hadKnownOkp) physicalKnown.push("OKP TOTAL");
    if (hadSelectedOkp) physicalSelected.push("OKP TOTAL");
    return {
      version: 1,
      physical: { known: [...new Set(physicalKnown)].sort(), selected: [...new Set(physicalSelected)].sort() },
      commercial: { known: commercialKnown, selected: commercialSelected },
    };
  } catch {
    return null;
  }
}

function mergeLevel(available: string[], saved: { known: string[]; selected: string[] }) {
  const normalizedAvailable = uniqueText(available) ?? [];
  const known = new Set(saved.known);
  const selected = new Set(saved.selected);
  for (const parking of normalizedAvailable) {
    if (!known.has(parking)) selected.add(parking);
    known.add(parking);
  }
  return { known: [...known].sort(), selected: [...selected].sort() };
}

export function mergeOccupancyParkingSelection(
  available: { physical: string[]; commercial: string[] },
  saved: OccupancyParkingSelection | null,
): OccupancyParkingSelection {
  const base = saved ?? emptyOccupancyParkingSelection();
  return {
    version: 1,
    physical: mergeLevel(available.physical, base.physical),
    commercial: mergeLevel(available.commercial, base.commercial),
  };
}
