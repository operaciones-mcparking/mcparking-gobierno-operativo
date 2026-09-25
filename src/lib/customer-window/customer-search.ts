export const CUSTOMER_SEARCH_TYPES = ["phone", "email", "plate", "booking_code", "source_customer_id"] as const;

export type CustomerSearchType = (typeof CUSTOMER_SEARCH_TYPES)[number];

export function isCustomerSearchType(value: string | null): value is CustomerSearchType {
  return CUSTOMER_SEARCH_TYPES.includes(value as CustomerSearchType);
}

export function normalizeCustomerSearchValue(type: CustomerSearchType, raw: string) {
  const value = raw.trim();
  if (type === "email") return value.toLowerCase();
  if (type === "plate") return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (type !== "phone") return value;

  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("056")) digits = digits.slice(1);
  if (digits.length === 8) return `569${digits}`;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  if (digits.length === 10 && digits.startsWith("09")) return `56${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("56")) return digits;
  return "";
}

export type CustomerWindowSearchTermsV2 = {
  email: string | null;
  exactIdentifier: string;
  numericIdentifier: string | null;
  phone: string | null;
  plate: string | null;
};

export function buildCustomerWindowSearchTermsV2(raw: string): CustomerWindowSearchTermsV2 | null {
  const exactIdentifier = raw.trim();
  if (exactIdentifier.length < 2 || exactIdentifier.length > 128) return null;
  const email = normalizeCustomerSearchValue("email", exactIdentifier);
  const phone = normalizeCustomerSearchValue("phone", exactIdentifier);
  const plate = normalizeCustomerSearchValue("plate", exactIdentifier);
  const numericIdentifier = /^[1-9]\d{0,18}$/.test(exactIdentifier) ? exactIdentifier : null;
  return {
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
    exactIdentifier,
    numericIdentifier,
    phone: phone || null,
    plate: plate.length >= 4 && plate.length <= 12 ? plate : null,
  };
}
