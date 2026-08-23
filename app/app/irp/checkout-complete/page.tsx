import Link from "next/link";

export default function IrpCheckoutCompletePage({ searchParams }: { searchParams: { status?: string } }) {
  const paid = searchParams.status === "success";
  return (
    <main className="wrap" style={{ maxWidth: 720, paddingTop: 80 }}>
      <section className="card">
        <div className="mono">IRP checkout</div>
        <h1>{paid ? "Payment received" : "Checkout cancelled"}</h1>
        <p className="muted">
          {paid
            ? "Return to the original assessment tab. It will verify payment and start the confirmed run automatically."
            : "No assessment was started. Return to the original assessment tab when you are ready to continue."}
        </p>
        <Link className="btn" href="/app/irp">Return to assessment</Link>
      </section>
    </main>
  );
}
