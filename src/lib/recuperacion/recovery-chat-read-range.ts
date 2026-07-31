export function resolveChatReadRange(params: {
  hasNewerCartForPhone: boolean;
  newerCartLookupFailed: boolean;
  nowIso: string;
  windowEnd: string;
  windowStart: string;
}) {
  return {
    chatReadEnd: params.newerCartLookupFailed || params.hasNewerCartForPhone ? params.windowEnd : params.nowIso,
    chatReadStart: params.windowStart,
  };
}