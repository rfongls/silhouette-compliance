import { signIn } from "@/auth";
import { Nav } from "@/components/Nav";

function ProviderIcon({ provider }: { provider: "google" | "github" | "microsoft" }) {
  if (provider === "github") {
    return (
      <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.51 2.86 8.34 6.84 9.7.5.09.68-.22.68-.49v-1.72c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.99c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.95.68 1.92v2.85c0 .27.18.59.69.49A10.12 10.12 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
      </svg>
    );
  }

  if (provider === "microsoft") {
    return (
      <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24">
        <path fill="#f25022" d="M3 3h8.5v8.5H3z" />
        <path fill="#7fba00" d="M12.5 3H21v8.5h-8.5z" />
        <path fill="#00a4ef" d="M3 12.5h8.5V21H3z" />
        <path fill="#ffb900" d="M12.5 12.5H21V21h-8.5z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24">
      <path fill="#4285f4" d="M21.6 12.23c0-.78-.07-1.54-.2-2.27H12v4.29h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.55z" />
      <path fill="#34a853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22z" />
      <path fill="#fbbc05" d="M6.41 13.9a6 6 0 0 1 0-3.8V7.51H3.07a10 10 0 0 0 0 8.98l3.34-2.59z" />
      <path fill="#ea4335" d="M12 5.98c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2 10 10 0 0 0 3.07 7.51l3.34 2.59C7.2 7.74 9.4 5.98 12 5.98z" />
    </svg>
  );
}

function ProviderButton({ provider, label, primary = false }: { provider: "google" | "github" | "microsoft"; label: string; primary?: boolean }) {
  const providerId = provider === "microsoft" ? "microsoft-entra-id" : provider;

  return (
    <form action={async () => {
      "use server";
      await signIn(providerId, { redirectTo: "/app" });
    }}>
      <button
        className={`btn${primary ? "" : " secondary"}`}
        aria-label={`Sign in with ${label}`}
        style={{ width: "100%", minHeight: 48, justifyContent: "flex-start", padding: "12px 16px" }}
      >
        <ProviderIcon provider={provider} />
        <span>{label}</span>
      </button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <main>
      <Nav />
      <section className="wrap" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="mono">Secure sign in</div>
          <h1 style={{ fontFamily: "EB Garamond", fontSize: 42, margin: "10px 0" }}>Access Silhouette</h1>
          <p className="muted">Use Google, GitHub, or Microsoft Entra ID. Accounts are scoped to a billing account and server-side role.</p>
          <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
            <ProviderButton provider="google" label="Google" primary />
            <ProviderButton provider="github" label="GitHub" />
            <ProviderButton provider="microsoft" label="Microsoft" />
          </div>
        </div>
      </section>
    </main>
  );
}
