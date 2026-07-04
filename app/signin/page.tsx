import { signIn } from "@/auth";
import { Nav } from "@/components/Nav";

export default function SignInPage() {
  const hasGoogleAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasGitHubAuth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const hasMicrosoftAuth = Boolean(
    process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET
  );

  return (
    <main>
      <Nav />
      <section className="wrap" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="mono">Secure sign in</div>
          <h1 style={{ fontFamily: "EB Garamond", fontSize: 42, margin: "10px 0" }}>Access Silhouette</h1>
          <p className="muted">Use an enabled SSO provider. Accounts are scoped to a billing account and server-side role.</p>
          <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
            {hasGoogleAuth && (
              <form action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/app" });
              }}>
                <button className="btn" style={{ width: "100%" }}>Continue with Google</button>
              </form>
            )}
            {hasGitHubAuth && (
              <form action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/app" });
              }}>
                <button className="btn secondary" style={{ width: "100%" }}>Continue with GitHub</button>
              </form>
            )}
            {hasMicrosoftAuth && (
              <form action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo: "/app" });
              }}>
                <button className="btn secondary" style={{ width: "100%" }}>Continue with Microsoft</button>
              </form>
            )}
            {!hasGoogleAuth && !hasGitHubAuth && !hasMicrosoftAuth && (
              <p className="muted">No SSO providers are configured yet.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
