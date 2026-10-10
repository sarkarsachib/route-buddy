import { createFileRoute } from "@tanstack/react-router";
import { handleSandboxWebhook } from "@/lib/api/ops.server";

// SANDBOX payment provider webhook. HMAC-SHA256 signature in `x-signature`.
// Idempotent by provider event id. Never trusts client-side success.
export const Route = createFileRoute("/api/public/payments/sandbox-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 10_000) return new Response("payload too large", { status: 413 });
        const res = await handleSandboxWebhook(raw, request.headers.get("x-signature"));
        return Response.json(res.body, { status: res.status });
      },
    },
  },
});
