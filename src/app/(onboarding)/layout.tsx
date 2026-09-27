import { eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SiteIcon, siteConfig } from "@/config/site"
import { AuthProvider } from "@/features/account/hooks/use-auth"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "MERCHANT" || !me.merchantId) redirect("/dashboard")

  const merchantRow = await dbRead
    .select({ onboardingCompletedAt: merchant.onboardingCompletedAt })
    .from(merchant)
    .where(eq(merchant.id, me.merchantId))
    .limit(1)
    .then((r) => r[0])

  if (merchantRow?.onboardingCompletedAt) redirect("/merchant")

  return (
    <AuthProvider>
      <div className="bg-background flex min-h-screen flex-col">
        <header className="border-border border-b px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <SiteIcon className="size-5" />
            <span className="text-lg font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </Link>
        </header>
        <main
          id="main-content"
          className="flex flex-1 items-center justify-center p-6"
        >
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}
