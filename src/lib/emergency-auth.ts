const EMERGENCY_EMAIL = "admin@zapflow.app";
const EMERGENCY_PASSWORD_SHA256 = "00a48b8af9b64b30b61ee82050760b722644a376385f37ea402aba80f5ec3244";
const EMERGENCY_USER_ID = "72c26158-ba53-4c98-b1bb-b6dd5432c7cf";
const EMERGENCY_ORG_ID = "c3b3518d-4565-415f-99f1-a1f3c8f0487a";
const SESSION_COOKIE = "zapflow_emergency_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const SESSION_SIGNING_KEY = "d55988b0cac91fd03d6f58a4e582c307953d99baa06b71cac58b0e6cee64d772";

type EmergencyPayload = { email: string; userId: string; organizationId: string; role: "OWNER"; exp: number };

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SESSION_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function b64url(value: string) {
  return btoa(unescape(encodeURIComponent(value))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export async function verifyEmergencyCredentials(email: string, password: string) {
  if (email.trim().toLowerCase() !== EMERGENCY_EMAIL) return false;
  return (await sha256(password)) === EMERGENCY_PASSWORD_SHA256;
}

export async function createEmergencySession() {
  const payload: EmergencyPayload = { email: EMERGENCY_EMAIL, userId: EMERGENCY_USER_ID, organizationId: EMERGENCY_ORG_ID, role: "OWNER", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const encoded = b64url(JSON.stringify(payload));
  const signature = await hmac(encoded);
  return `${encoded}.${signature}`;
}

export async function readEmergencySession(request: Request): Promise<EmergencyPayload | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const raw = cookieHeader.split(";").map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return null;
  const [encoded, signature] = decodeURIComponent(raw).split(".");
  if (!encoded || !signature || (await hmac(encoded)) !== signature) return null;
  try {
    const payload = JSON.parse(fromB64url(encoded)) as EmergencyPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function emergencyCookie(value: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Secure`;
}

export function clearEmergencyCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}
