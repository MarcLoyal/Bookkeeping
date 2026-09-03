"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Submits JSON to a Route Handler and navigates client-side on success.
 *
 * Not a Server Action: this app's Server Actions, when they call redirect()
 * to a page that itself checks auth via cookies(), can lose the request's
 * session during Next's internal "stream the redirect target" step and
 * bounce an authenticated mutation to /login (reproduced independent of any
 * app code — see DECISIONS.md). A real browser-initiated navigation
 * (router.push after a plain fetch) doesn't go through that internal path,
 * so mutations here use a Route Handler instead.
 */
export function useJsonPost<TBody>(url: string, onSuccessPath: (data: any) => string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Which request field the server blamed (Route Handlers echo back the
  // failing Zod issue's path[0] alongside the message — see e.g.
  // app/api/clients/route.ts) so a form can highlight that specific input
  // instead of showing one undifferentiated error line.
  const [field, setField] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(body: TBody) {
    setPending(true);
    setError(null);
    setField(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error ?? `Request failed (${res.status}).`);
        setField(typeof data.field === "string" ? data.field : null);
        setPending(false);
        return;
      }
      router.push(onSuccessPath(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      setPending(false);
    }
  }

  return { submit, error, field, pending };
}
