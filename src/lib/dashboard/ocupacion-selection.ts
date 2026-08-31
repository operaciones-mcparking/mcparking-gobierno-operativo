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

export function availableOccupancyParkingNames(available: { physical: string[]; commercial: string[] }) {
  return {
    physical: uniqueText(available.physical) ?? [],
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
    const value = JSON.parse(raw) as Partial<OccupancyParkingSelection>;
    if (value.version !== 1 || !value.physical || !value.commercial) return null;
    const physicalKnown = uniqueText(value.physical.known);
    const physicalSelected = uniqueText(value.physical.selected);
    const commercialKnown = uniqueText(value.commercial.known);
    const commercialSelected = uniqueText(value.commercial.selected);
    if (!physicalKnown || !physicalSelected || !commercialKnown || !commercialSelected) return null;
    return {
      version: 1,
      physical: { known: physicalKnown, selected: physicalSelected },
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
