/** Evolution versions send either one message or an array. Keep every item scoped
 * to the authenticated instance and unwrap only known message envelopes. */
export function messagePayloads(payload: Record<string, any>) {
  const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.data?.messages) ? payload.data.messages : [payload.data];
  return items.filter(item => item && typeof item === "object" && !Array.isArray(item)).map(item => {
    let message = item.message;
    for (let depth = 0; depth < 5; depth++) {
      const nested = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message || message?.documentWithCaptionMessage?.message;
      if (!nested) break;
      message = nested;
    }
    const timestamp = Number(item.messageTimestamp);
    return { ...payload, data: { ...item, message, ...(timestamp > 1e12 ? { messageTimestamp: Math.floor(timestamp / 1000) } : {}) } };
  });
}
