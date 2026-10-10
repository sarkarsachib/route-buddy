/**
 * Provider-agnostic payment abstraction. No live provider is configured; the
 * only digital adapter is SANDBOX. Client-side "success" is never trusted —
 * status changes come only from verified, idempotent webhooks.
 */
export interface WebhookEvent {
  eventId: string;
  paymentReference: string;
  status: "succeeded" | "failed";
  amountPaise: number;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret: string, body: string): Promise<string> {
  return hmacHex(secret, body);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  return timingSafeEqual(await hmacHex(secret, body), signature);
}

export function parseWebhook(body: string): WebhookEvent {
  const j = JSON.parse(body);
  if (typeof j.eventId !== "string" || typeof j.paymentReference !== "string") throw new Error("bad payload");
  if (j.status !== "succeeded" && j.status !== "failed") throw new Error("bad status");
  if (!Number.isSafeInteger(j.amountPaise)) throw new Error("amount must be integer paise");
  return j as WebhookEvent;
}

export interface WebhookStore {
  hasEvent(eventId: string): Promise<boolean>;
  recordEvent(e: WebhookEvent): Promise<boolean>; // false if duplicate (unique violation)
  getPayment(ref: string): Promise<{ id: string; amountPaise: number; status: string } | null>;
  setPaymentStatus(id: string, status: string): Promise<void>;
  appendLedger(paymentId: string, amountPaise: number, type: string): Promise<void>;
}

export type WebhookOutcome = "processed" | "duplicate" | "unknown_payment" | "amount_mismatch" | "already_final";

/** Idempotent: the same eventId applied twice has exactly one effect. */
export async function processWebhook(store: WebhookStore, e: WebhookEvent): Promise<WebhookOutcome> {
  if (await store.hasEvent(e.eventId)) return "duplicate";
  const inserted = await store.recordEvent(e);
  if (!inserted) return "duplicate";
  const p = await store.getPayment(e.paymentReference);
  if (!p) return "unknown_payment";
  if (p.amountPaise !== e.amountPaise) return "amount_mismatch";
  if (p.status === "succeeded" || p.status === "refunded") return "already_final";
  await store.setPaymentStatus(p.id, e.status);
  if (e.status === "succeeded") await store.appendLedger(p.id, e.amountPaise, "payment_captured");
  return "processed";
}
