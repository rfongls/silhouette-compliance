import Link from "next/link";
import { cookies } from "next/headers";
import { auth, signOut } from "@/auth";
import { getEffectiveRole, isAdminSession, VIEW_MODE_COOKIE } from "@/lib/view-role";

async function setAdminViewMode(formData: FormData) {
  "use server";
  const mode = formData.get("mode") === "customer" ? "customer" : "admin";
  cookies().set(VIEW_MODE_COOKIE, mode, { path: "/", sameSite: "lax", httpOnly: true });
}

export async function Nav() {
  const session = await auth();
  const isAdmin = isAdminSession(session);
  const effectiveRole = getEffectiveRole(session);
  const viewingAsCustomer = isAdmin && effectiveRole === "customer";
  return <nav className="nav"><Link href="/" className="brand">Silhouette<span>.</span></Link><div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>{session?.user ? <><Link className="btn secondary" href="/app">App</Link><Link className="btn secondary" href="/app/profile">Profile</Link>{isAdmin && !viewingAsCustomer ? <Link className="btn secondary" href="/admin">Admin</Link> : null}{isAdmin ? <form action={setAdminViewMode}><input type="hidden" name="mode" value={viewingAsCustomer ? "admin" : "customer"} /><button className="btn ghost" title={viewingAsCustomer ? "Return to admin view" : "Preview the customer experience"}>{viewingAsCustomer ? "Admin view" : "Customer view"}</button></form> : null}<form action={async()=>{"use server"; await signOut({ redirectTo: "/" });}}><button className="btn ghost">Sign out</button></form></> : <Link className="btn secondary" href="/signin">Sign in</Link>}</div></nav>;
}
