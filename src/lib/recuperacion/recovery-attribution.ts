export const RECOVERY_ATTRIBUTION_CALCULATION_VERSION = "v1-intended-arrival";

export type RecoveryAttributionStatus =
  | "recovered_with_amount"
  | "recovered_pack"
  | "payment_review"
  | "unrecovered";

export type RecoveryAttributionConfidence = "high" | "medium" | "low";
export type RecoveryAttributionMatchType = "email_phone" | "phone" | "email";

export type RecoveryAttributionCartInput = {
  batch_id?: string | null;
  email_normalized: string | null;
  form_datetime: string | null;
  id: string;
  intended_arrival_at?: string | null;
  message_sent?: boolean | null;
  parking_code?: string | null;
  phone_normalized: string | null;
  row_hash?: string | null;
  type?: string | null;
};

export type RecoveryAttributionPurchaseInput = {
  batch_id?: string | null;
  booking_created_at: string | null;
  booking_status?: number | null;
  email_normalized: string | null;
  id: string;
  is_valid_purchase?: boolean | null;
  paying_status?: string | null;
  phone_normalized: string | null;
  price: number | null;
  row_hash?: string | null;
};

export type RecoveryAttributionResult = {
  attributedAmount: number | null;
  attributedPurchaseAt: string | null;
  attributedPurchaseId: string | null;
  attributionReason: string;
  cartBatchId: string | null;
  cartFormDatetime: string | null;
  cartId: string;
  cartRowHash: string | null;
  confidence: RecoveryAttributionConfidence | null;
  intendedArrivalAt: string | null;
  matchType: RecoveryAttributionMatchType | null;
  purchaseBatchId: string | null;
  purchaseRowHash: string | null;
  status: RecoveryAttributionStatus;
};

export type RecoveryAttributionSummary = {
  cartsTotal: number;
  operationalRecovered: number;
  recoveredAmount: number;
  recoveredConfirmed: number;
  recoveredReview: number;
  recoveryRate: number;
  unrecovered: number;
};

export type RecoveryAttributionMatch = {
  cart_form_datetime: string | null;
  cart_id: string;
  cart_type: string | null;
  confidence: RecoveryAttributionConfidence | null;
  email: string | null;
  hours_to_purchase: number | null;
  match_type: RecoveryAttributionMatchType | null;
  message_sent: boolean | null;
  parking_code: string | null;
  phone: string | null;
  purchase_amount: number | null;
  purchase_created_at: string | null;
  purchase_id: string;
  recovered_24h: boolean | null;
  recovered_48h: boolean | null;
  recovered_7d: boolean | null;
};

type CandidateMatch = RecoveryAttributionMatch & {
  attribution_reason: string;
  cart_batch_id: string | null;
  cart_row_hash: string | null;
  confidence_rank: number;
  cart_type_rank: number;
  intended_arrival_at: string | null;
  purchase_batch_id: string | null;
  purchase_row_hash: string | null;
};

function comparableEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function comparablePhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function cartTypeRank(type: string | null | undefined) {
  if (type === "canceled") return 1;
  if (type === "abandoned") return 2;
  return 3;
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

export function isRecoveryPaymentReviewPurchase(purchase: RecoveryAttributionPurchaseInput) {
  return (
    purchase.is_valid_purchase !== true &&
    Number(purchase.booking_status) === 9 &&
    String(purchase.paying_status ?? "").trim() === "1"
  );
}

function buildCandidate(
  cart: RecoveryAttributionCartInput,
  purchase: RecoveryAttributionPurchaseInput,
): CandidateMatch | null {
  if (!cart.form_datetime || !purchase.booking_created_at) return null;

  const cartDate = new Date(cart.form_datetime);
  const purchaseDate = new Date(purchase.booking_created_at);

  if (!isValidDate(cartDate) || !isValidDate(purchaseDate)) return null;
  if (purchaseDate < cartDate) return null;

  const intendedArrivalDate = cart.intended_arrival_at ? new Date(cart.intended_arrival_at) : null;

  if (intendedArrivalDate && isValidDate(intendedArrivalDate)) {
    if (purchaseDate > intendedArrivalDate) return null;
  } else {
    const recoveryWindowEnd = new Date(cartDate);
    recoveryWindowEnd.setUTCDate(recoveryWindowEnd.getUTCDate() + 7);
    if (purchaseDate >= recoveryWindowEnd) return null;
  }

  const cartEmail = comparableEmail(cart.email_normalized);
  const purchaseEmail = comparableEmail(purchase.email_normalized);
  const cartPhone = comparablePhone(cart.phone_normalized);
  const purchasePhone = comparablePhone(purchase.phone_normalized);
  const emailMatches = Boolean(cartEmail && purchaseEmail && cartEmail === purchaseEmail);
  const phoneMatches = Boolean(cartPhone && purchasePhone && cartPhone === purchasePhone);

  if (!emailMatches && !phoneMatches) return null;

  const confidence: RecoveryAttributionConfidence = emailMatches && phoneMatches ? "high" : phoneMatches ? "medium" : "low";
  const confidenceRank = confidence === "high" ? 1 : confidence === "medium" ? 2 : 3;
  const matchType: RecoveryAttributionMatchType = confidence === "high" ? "email_phone" : confidence === "medium" ? "phone" : "email";
  const attributionReason = confidence === "high" ? "email_and_phone_match" : confidence === "medium" ? "phone_match" : "email_match";
  const hoursToPurchase = Math.round(((purchaseDate.getTime() - cartDate.getTime()) / 3_600_000) * 100) / 100;

  return {
    attribution_reason: attributionReason,
    cart_batch_id: cart.batch_id ?? null,
    cart_form_datetime: cart.form_datetime,
    cart_id: cart.id,
    cart_row_hash: cart.row_hash ?? null,
    cart_type: cart.type ?? null,
    confidence,
    confidence_rank: confidenceRank,
    cart_type_rank: cartTypeRank(cart.type),
    email: cart.email_normalized ?? purchase.email_normalized ?? null,
    hours_to_purchase: hoursToPurchase,
    intended_arrival_at: cart.intended_arrival_at ?? null,
    match_type: matchType,
    message_sent: cart.message_sent ?? null,
    parking_code: cart.parking_code ?? null,
    phone: cart.phone_normalized ?? purchase.phone_normalized ?? null,
    purchase_amount: Number(purchase.price ?? 0),
    purchase_batch_id: purchase.batch_id ?? null,
    purchase_created_at: purchase.booking_created_at,
    purchase_id: purchase.id,
    purchase_row_hash: purchase.row_hash ?? null,
    recovered_24h: hoursToPurchase <= 24,
    recovered_48h: hoursToPurchase <= 48,
    recovered_7d: true,
  };
}

export function buildRecoveryAttributionMatches(
  carts: RecoveryAttributionCartInput[],
  purchases: RecoveryAttributionPurchaseInput[],
): RecoveryAttributionMatch[] {
  return buildRankedRecoveryAttributionMatches(carts, purchases).map(({
    attribution_reason: _attributionReason,
    cart_batch_id: _cartBatchId,
    cart_row_hash: _cartRowHash,
    confidence_rank: _confidenceRank,
    cart_type_rank: _cartTypeRank,
    intended_arrival_at: _intendedArrivalAt,
    purchase_batch_id: _purchaseBatchId,
    purchase_row_hash: _purchaseRowHash,
    ...match
  }) => match);
}

function buildRankedRecoveryAttributionMatches(
  carts: RecoveryAttributionCartInput[],
  purchases: RecoveryAttributionPurchaseInput[],
): CandidateMatch[] {
  const candidates: CandidateMatch[] = [];

  for (const cart of carts) {
    for (const purchase of purchases) {
      const candidate = buildCandidate(cart, purchase);
      if (candidate) candidates.push(candidate);
    }
  }

  const bestByPurchase = new Map<string, CandidateMatch>();

  for (const candidate of candidates) {
    const current = bestByPurchase.get(candidate.purchase_id);

    if (!current) {
      bestByPurchase.set(candidate.purchase_id, candidate);
      continue;
    }

    const candidateCartTime = candidate.cart_form_datetime ? new Date(candidate.cart_form_datetime).getTime() : 0;
    const currentCartTime = current.cart_form_datetime ? new Date(current.cart_form_datetime).getTime() : 0;

    if (
      candidateCartTime > currentCartTime ||
      (candidateCartTime === currentCartTime && candidate.confidence_rank < current.confidence_rank) ||
      (candidateCartTime === currentCartTime &&
        candidate.confidence_rank === current.confidence_rank &&
        candidate.cart_type_rank < current.cart_type_rank) ||
      (candidateCartTime === currentCartTime &&
        candidate.confidence_rank === current.confidence_rank &&
        candidate.cart_type_rank === current.cart_type_rank &&
        candidate.cart_id.localeCompare(current.cart_id) < 0)
    ) {
      bestByPurchase.set(candidate.purchase_id, candidate);
    }
  }

  const bestByCart = new Map<string, CandidateMatch>();

  for (const candidate of bestByPurchase.values()) {
    const current = bestByCart.get(candidate.cart_id);

    if (!current) {
      bestByCart.set(candidate.cart_id, candidate);
      continue;
    }

    const candidatePurchaseTime = candidate.purchase_created_at ? new Date(candidate.purchase_created_at).getTime() : 0;
    const currentPurchaseTime = current.purchase_created_at ? new Date(current.purchase_created_at).getTime() : 0;

    if (
      candidatePurchaseTime < currentPurchaseTime ||
      (candidatePurchaseTime === currentPurchaseTime && candidate.confidence_rank < current.confidence_rank) ||
      (candidatePurchaseTime === currentPurchaseTime &&
        candidate.confidence_rank === current.confidence_rank &&
        candidate.purchase_id.localeCompare(current.purchase_id) < 0)
    ) {
      bestByCart.set(candidate.cart_id, candidate);
    }
  }

  return Array.from(bestByCart.values());
}

function resultForCart(
  cart: RecoveryAttributionCartInput,
  attribution: CandidateMatch | undefined,
  paymentReview: CandidateMatch | undefined,
): RecoveryAttributionResult {
  const selected = attribution ?? paymentReview;
  const amount = selected?.purchase_amount ?? null;

  return {
    attributedAmount: amount,
    attributedPurchaseAt: selected?.purchase_created_at ?? null,
    attributedPurchaseId: selected?.purchase_id ?? null,
    attributionReason: selected?.attribution_reason ?? "no_attribution",
    cartBatchId: cart.batch_id ?? null,
    cartFormDatetime: cart.form_datetime,
    cartId: cart.id,
    cartRowHash: cart.row_hash ?? null,
    confidence: selected?.confidence ?? null,
    intendedArrivalAt: cart.intended_arrival_at ?? null,
    matchType: selected?.match_type ?? null,
    purchaseBatchId: selected?.purchase_batch_id ?? null,
    purchaseRowHash: selected?.purchase_row_hash ?? null,
    status: attribution
      ? Number(amount ?? 0) > 0
        ? "recovered_with_amount"
        : "recovered_pack"
      : paymentReview
        ? "payment_review"
        : "unrecovered",
  };
}

export function resolveRecoveryAttributions(
  carts: RecoveryAttributionCartInput[],
  purchases: RecoveryAttributionPurchaseInput[],
): RecoveryAttributionResult[] {
  const validAttributions = new Map(
    buildRankedRecoveryAttributionMatches(
      carts,
      purchases.filter((purchase) => purchase.is_valid_purchase === true),
    ).map((item) => [item.cart_id, item]),
  );
  const paymentReviews = new Map(
    buildRankedRecoveryAttributionMatches(
      carts,
      purchases.filter(isRecoveryPaymentReviewPurchase),
    ).map((item) => [item.cart_id, item]),
  );

  return carts.map((cart) => {
    const attribution = validAttributions.get(cart.id);
    const paymentReview = attribution ? undefined : paymentReviews.get(cart.id);

    return resultForCart(cart, attribution, paymentReview);
  });
}

export function summarizeRecoveryAttributions(results: RecoveryAttributionResult[]): RecoveryAttributionSummary {
  const cartsTotal = results.length;
  const recoveredConfirmed = results.filter(
    (result) => result.status === "recovered_with_amount" || result.status === "recovered_pack",
  ).length;
  const recoveredReview = results.filter((result) => result.status === "payment_review").length;
  const operationalRecovered = recoveredConfirmed + recoveredReview;
  const recoveredAmount = results.reduce(
    (total, result) => total + (result.status !== "unrecovered" ? Number(result.attributedAmount ?? 0) : 0),
    0,
  );

  return {
    cartsTotal,
    operationalRecovered,
    recoveredAmount,
    recoveredConfirmed,
    recoveredReview,
    recoveryRate: cartsTotal > 0 ? (operationalRecovered / cartsTotal) * 100 : 0,
    unrecovered: cartsTotal - operationalRecovered,
  };
}
