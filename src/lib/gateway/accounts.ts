export function accountLabel(account: { internal_name?: string | null; session_id: string }, fallback = "WhatsApp") {
  if (account.internal_name && account.internal_name !== account.session_id) return account.internal_name;
  const slot = /-(\d+)$/.exec(account.session_id)?.[1];
  return slot ? `WhatsApp ${Number(slot)}` : fallback;
}
