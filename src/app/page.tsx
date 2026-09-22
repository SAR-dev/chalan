import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { homeForRole } from "@/lib/nav-config"

export default async function Page() {
  const me = await requireSession()
  if (me) {
    redirect(homeForRole(me.role))
  }
  redirect("/landing")
}
