import { signIn } from "@/auth";
import { Nav } from "@/components/Nav";

export default function SignInPage() {
  return <main><Nav/><section className="wrap" style={{maxWidth:560}}><div className="card"><div className="mono">Secure sign in</div><h1 style={{fontFamily:"EB Garamond",fontSize:42,margin:"10px 0"}}>Access Silhouette</h1><p className="muted">Use Google, GitHub, or Microsoft Entra ID. Accounts are scoped to a billing account and server-side role.</p><div style={{display:"grid",gap:12,marginTop:22}}><form action={async()=>{"use server"; await signIn("google", { redirectTo: "/app" });}}><button className="btn" style={{width:"100%"}}>Continue with Google</button></form><form action={async()=>{"use server"; await signIn("github", { redirectTo: "/app" });}}><button className="btn secondary" style={{width:"100%"}}>Continue with GitHub</button></form><form action={async()=>{"use server"; await signIn("microsoft-entra-id", { redirectTo: "/app" });}}><button className="btn secondary" style={{width:"100%"}}>Continue with Microsoft</button></form></div></div></section></main>;
}
