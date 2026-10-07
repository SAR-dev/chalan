import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { loginRedirectPath } from "@/lib/login-redirect"
import { LabelDesignerPageClient } from "./label-designer-client"

export default async function LabelDesignerPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/dashboard")

  return <LabelDesignerPageClient />
}
