import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Nav } from "@/components/Nav";
import { isComplianceEmailAllowed } from "@/lib/access-gate";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  if (!isComplianceEmailAllowed(session.user.email)) {
    return (
      <main>
        <Nav />
        <section className="wrap" style={{ maxWidth: 760 }}>
          <div className="card">
            <div className="mono">Access restricted</div>
            <h1 style={{ fontFamily: "EB Garamond", fontSize: 42, margin: "10px 0" }}>Compliance suite is temporarily private</h1>
            <p className="muted">
              We are limiting access while the module flows are being repaired. Use an approved Silhouette owner account to continue.
            </p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button className="btn secondary">Sign out</button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return children;
}
