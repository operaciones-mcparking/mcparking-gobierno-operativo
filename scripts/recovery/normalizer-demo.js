const WINDOW_HOURS = [24, 48, 168];

function normalizePhone(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  let digits = String(raw).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("056")) {
    digits = digits.slice(1);
  }

  if (digits.length === 8) {
    return `569${digits}`;
  }

  if (digits.length === 9 && digits.startsWith("9")) {
    return `56${digits}`;
  }

  if (digits.length === 10 && digits.startsWith("09")) {
    return `56${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("56")) {
    return digits;
  }

  return null;
}

function normalizeEmail(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const email = String(raw).trim().toLowerCase();

  return email.length > 0 ? email : null;
}

function normalizePrice(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  const cleaned = String(raw)
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "");

  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\./g, "");
  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

function isValidPurchase(bookingStatus) {
  const status = Number(bookingStatus);

  return status === 1 || status === 8;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(start, end) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function matchRecoveredPurchase(cart, purchases, windowHours) {
  const startDate = toDate(cart.sent_at ?? cart.form_datetime);

  if (!startDate) {
    return {
      amount: null,
      confidence: "none",
      purchaseId: null,
      recovered: false,
    };
  }

  const cartPhone = normalizePhone(cart.phone);
  const cartEmail = normalizeEmail(cart.email);
  const candidates = purchases
    .map((purchase) => {
      const purchaseDate = toDate(purchase.booking_created_at);
      const purchasePhone = normalizePhone(purchase.phone);
      const purchaseEmail = normalizeEmail(purchase.email);
      const phoneMatch = Boolean(cartPhone && purchasePhone && cartPhone === purchasePhone);
      const emailMatch = Boolean(cartEmail && purchaseEmail && cartEmail === purchaseEmail);

      return {
        amount: normalizePrice(purchase.price),
        confidence: phoneMatch && emailMatch ? "high" : phoneMatch ? "medium" : emailMatch ? "low" : "none",
        date: purchaseDate,
        id: purchase.id,
        valid: isValidPurchase(purchase.bookingStatus),
      };
    })
    .filter((purchase) => {
      if (!purchase.valid || !purchase.date || purchase.confidence === "none") {
        return false;
      }

      const hours = hoursBetween(startDate, purchase.date);

      return hours > 0 && hours <= windowHours;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const match = candidates[0];

  if (!match) {
    return {
      amount: null,
      confidence: "none",
      purchaseId: null,
      recovered: false,
    };
  }

  return {
    amount: match.amount,
    confidence: match.confidence,
    purchaseId: match.id,
    recovered: true,
  };
}

const phoneCases = [
  "+56 9 1234 5678",
  "912345678",
  "56912345678",
  "09 1234 5678",
  "",
  null,
];

const emailCases = [" Cliente@Demo.CL ", "cliente@demo.cl", ""];
const priceCases = [120000, "120.000", "$120.000", "120000,50", ""];
const statusCases = [1, 8, "1", "8", 2, "cancelled", null];

const carts = [
  {
    id: "cart-a",
    email: "cliente.a@demo.cl",
    form_datetime: "2026-07-15T08:30:00-04:00",
    phone: "+56 9 1111 2222",
    sent_at: "2026-07-15T09:00:00-04:00",
  },
  {
    id: "cart-b",
    email: null,
    form_datetime: "2026-07-15T10:15:00-04:00",
    phone: "922223333",
    sent_at: "2026-07-15T10:30:00-04:00",
  },
  {
    id: "cart-c",
    email: "cliente.c@demo.cl",
    form_datetime: "2026-07-15T12:00:00-04:00",
    phone: null,
    sent_at: "2026-07-15T12:20:00-04:00",
  },
  {
    id: "cart-d",
    email: "cliente.d@demo.cl",
    form_datetime: "2026-07-15T15:00:00-04:00",
    phone: "+56 9 4444 5555",
    sent_at: "2026-07-15T15:30:00-04:00",
  },
];

const purchases = [
  {
    id: "purchase-a",
    bookingStatus: 1,
    booking_created_at: "2026-07-15T12:00:00-04:00",
    email: "CLIENTE.A@DEMO.CL",
    phone: "56911112222",
    price: "120.000",
  },
  {
    id: "purchase-b",
    bookingStatus: 8,
    booking_created_at: "2026-07-16T08:00:00-04:00",
    email: "otra@demo.cl",
    phone: "+56 9 2222 3333",
    price: "$80.000",
  },
  {
    id: "purchase-c",
    bookingStatus: 1,
    booking_created_at: "2026-07-16T10:00:00-04:00",
    email: " cliente.c@demo.cl ",
    phone: "+56 9 9999 0000",
    price: "50000",
  },
  {
    id: "purchase-before",
    bookingStatus: 1,
    booking_created_at: "2026-07-15T07:00:00-04:00",
    email: "cliente.d@demo.cl",
    phone: "+56 9 4444 5555",
    price: "70000",
  },
  {
    id: "purchase-invalid",
    bookingStatus: 3,
    booking_created_at: "2026-07-15T17:00:00-04:00",
    email: "cliente.d@demo.cl",
    phone: "+56 9 4444 5555",
    price: "90000",
  },
];

console.log("Phone normalization demo");
console.table(phoneCases.map((input) => ({ input, normalized: normalizePhone(input) })));

console.log("Email normalization demo");
console.table(emailCases.map((input) => ({ input, normalized: normalizeEmail(input) })));

console.log("Price normalization demo");
console.table(priceCases.map((input) => ({ input, normalized: normalizePrice(input) })));

console.log("Valid purchase demo");
console.table(statusCases.map((input) => ({ input, valid: isValidPurchase(input) })));

for (const windowHours of WINDOW_HOURS) {
  console.log(`Recovery matching demo (${windowHours}h)`);
  console.table(
    carts.map((cart) => {
      const match = matchRecoveredPurchase(cart, purchases, windowHours);

      return {
        amount: match.amount,
        cart: cart.id,
        confidence: match.confidence,
        purchase: match.purchaseId,
        recovered: match.recovered,
      };
    }),
  );
}

module.exports = {
  isValidPurchase,
  matchRecoveredPurchase,
  normalizeEmail,
  normalizePhone,
  normalizePrice,
};
