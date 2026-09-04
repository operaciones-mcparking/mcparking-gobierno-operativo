export const CUSTOMER_SEARCH_TYPES = ["phone", "email", "plate", "booking_code", "source_customer_id"] as const;

export type CustomerSearchType = (typeof CUSTOMER_SEARCH_TYPES)[number];

export function isCustomerSearchType(value: string | null): value is CustomerSearchType {
  return CUSTOMER_SEARCH_TYPES.includes(value as CustomerSearchType);
}

export function normalizeCustomerSearchValue(type: CustomerSearchType, raw: string) {
  const value = raw.trim();
  if (type === "email") return value.toLowerCase();
  if (type === "plate") return value.toUpperCase().replace(/[\s-]/g, "");
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
