import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Nav() {
  const session = await auth();
  return <nav className="nav"><Link href="/" className="brand">Silhouette<span>.</span></Link><div style={{display:"flex",gap:10,alignItems:"center"}}>{session?.user ? <><Link className="btn secondary" href="/app">App</Link>{session.user.role === "admin" ? <Link className="btn secondary" href="/admin">Admin</Link> : null}<form action={async()=>{"use server"; await signOut({ redirectTo: "/" });}}><button className="btn ghost">Sign out</button></form></> : <Link className="btn secondary" href="/signin">Sign in</Link>}</div></nav>;
}
