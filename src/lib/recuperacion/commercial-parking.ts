export type RecoveryCommercialParkingCode = "MPV" | "EAP";
export type RecoveryCommercialParkingResolutionStatus = "resolved" | "conflict" | "unknown";

export type RecoveryCommercialParkingInput = {
  cmsUrl?: string | null;
  parkingCode?: string | null;
  websiteSource?: number | string | null;
};

export type RecoveryCommercialParkingResolution = {
  parkingCode: RecoveryCommercialParkingCode | null;
  reason: string;
  status: RecoveryCommercialParkingResolutionStatus;
};

const EAP_HOSTS = new Set(["estacionamientoaeropuerto.cl", "www.estacionamientoaeropuerto.cl"]);
const MPV_HOSTS = new Set(["mcparking.cl", "www.mcparking.cl"]);

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

export function recoveryCommercialHostname(value: string | null | undefined) {
  const text = cleanText(value);

  if (!text) return null;

  const candidates = [text, `https://${text}`];

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      const hostname = parsed.hostname.trim().toLowerCase();

      return hostname.length > 0 ? hostname : null;
    } catch {
      // Try the next candidate. Some source rows store only a hostname.
    }
  }

  return null;
}

function normalizeParkingCode(value: string | null | undefined): RecoveryCommercialParkingCode | null {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === "MPV") return "MPV";
  if (normalized === "EAP") return "EAP";

  return null;
}

function parkingFromWebsiteSource(value: number | string | null | undefined): RecoveryCommercialParkingCode | null {
  if (value === null || value === undefined || value === "") return null;

  const source = typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return source === 2 ? "EAP" : null;
}

function parkingFromHost(hostname: string | null): RecoveryCommercialParkingCode | null {
  if (!hostname) return null;
  if (EAP_HOSTS.has(hostname)) return "EAP";
  if (MPV_HOSTS.has(hostname)) return "MPV";

  return null;
}

export function resolveRecoveryCommercialParking(input: RecoveryCommercialParkingInput): RecoveryCommercialParkingResolution {
  const websiteSourceParking = parkingFromWebsiteSource(input.websiteSource);
  const hostname = recoveryCommercialHostname(input.cmsUrl);
  const hostParking = parkingFromHost(hostname);
  const originalParking = normalizeParkingCode(input.parkingCode);
  const reliableSignals = [
    websiteSourceParking ? { reason: "website_source", value: websiteSourceParking } : null,
    hostParking ? { reason: "cms_url_host", value: hostParking } : null,
  ].filter((item): item is { reason: string; value: RecoveryCommercialParkingCode } => item !== null);
  const reliableValues = new Set(reliableSignals.map((signal) => signal.value));

  if (reliableValues.size > 1) {
    return {
      parkingCode: null,
      reason: `conflict:${reliableSignals.map((signal) => `${signal.reason}=${signal.value}`).join(",")}`,
      status: "conflict",
    };
  }

  const reliableParking = reliableSignals[0]?.value ?? null;

  if (reliableParking) {
    return {
      parkingCode: reliableParking,
      reason: reliableSignals[0].reason,
      status: "resolved",
    };
  }

  if (originalParking) {
    return {
      parkingCode: originalParking,
      reason: "parking_code",
      status: "resolved",
    };
  }

  return {
    parkingCode: null,
    reason: hostname ? "unknown_host" : "unknown_origin",
    status: "unknown",
  };
}
