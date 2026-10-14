export type RecoveryChatMergeMessage = {
  direction: "inbound" | "outbound";
  messageAt: string;
  messageSource: string | null;
  messageText: string | null;
  source: "live" | "message_memory";
  sourceMessageId: string | null;
  whatsappMessageId: string | null;
};

export function recoveryChatMessageIdentity(message: RecoveryChatMergeMessage) {
  if (message.whatsappMessageId) return `wamid:${message.whatsappMessageId}`;
  if (message.sourceMessageId) return `source:${message.source}:${message.sourceMessageId}`;

  return [
    "fallback",
    message.source,
    message.direction,
    message.messageAt,
    message.messageText ?? "",
    message.messageSource ?? "",
  ].join(":");
}

export function mergeRecoveryChatMessages<T extends RecoveryChatMergeMessage>(
  existing: T[],
  incoming: T[],
  reconciledLiveMessageIds: string[] = [],
) {
  const reconciledLiveIds = new Set(reconciledLiveMessageIds);
  const incomingLiveIds = new Set(
    incoming.flatMap((message) => (
      message.source === "live" && message.sourceMessageId ? [message.sourceMessageId] : []
    )),
  );
  const mergedByIdentity = new Map<string, T>();

  const retainedExisting = existing.filter((message) => (
    message.source !== "live"
    || !message.sourceMessageId
    || !incomingLiveIds.has(message.sourceMessageId)
  ));

  for (const message of [...retainedExisting, ...incoming]) {
    if (
      message.source === "live"
      && message.sourceMessageId
      && reconciledLiveIds.has(message.sourceMessageId)
    ) {
      continue;
    }

    const key = recoveryChatMessageIdentity(message);
    const current = mergedByIdentity.get(key);

    if (!current || current.source === "live" || message.source === "message_memory") {
      mergedByIdentity.set(key, message);
    }
  }

  return [...mergedByIdentity.values()].sort((left, right) => {
    const leftTime = new Date(left.messageAt).getTime();
    const rightTime = new Date(right.messageAt).getTime();

    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.direction !== right.direction) return left.direction === "inbound" ? -1 : 1;

    return recoveryChatMessageIdentity(left).localeCompare(recoveryChatMessageIdentity(right));
  });
}
