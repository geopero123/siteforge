"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BillingActions({
  ready,
  hasCustomer,
}: {
  ready: boolean;
  hasCustomer: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  async function open(action: "single" | "monthly" | "portal") {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(
        `/api/billing/${action === "portal" ? "portal" : "checkout"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "portal" ? {} : { plan: action }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to open billing. Please retry.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open billing.");
      setBusy(null);
    }
  }
  return (
    <div className="billing-actions">
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="billing-buttons">
        <button
          className="button"
          disabled={!ready || !!busy}
          onClick={() => open("single")}
        >
          {busy === "single" ? "Opening checkout…" : "Buy one test · $2"}
        </button>
        <button
          className="button primary"
          disabled={!ready || !!busy}
          onClick={() => open("monthly")}
        >
          {busy === "monthly" ? "Opening checkout…" : "Subscribe · $7.99/month"}
        </button>
        {hasCustomer && (
          <button
            className="button"
            disabled={!!busy}
            onClick={() => open("portal")}
          >
            {busy === "portal" ? "Opening portal…" : "Manage billing & cancel"}
          </button>
        )}
        <button
          className="button small"
          disabled={!!busy}
          onClick={() => router.refresh()}
        >
          Refresh balance
        </button>
      </div>
      {!ready && (
        <p>
          Payments are being set up. Purchases will be available here when
          checkout is ready.
        </p>
      )}
    </div>
  );
}
