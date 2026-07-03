"use client";

export function CheckoutButton({ module, quantity = 1, children }: { module: "irp" | "sra" | "proposal"; quantity?: number; children: React.ReactNode }) {
  async function go() {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module, quantity }) });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert(data.error || "Checkout failed");
  }
  return <button className="btn" onClick={go}>{children}</button>;
}
