import { PartyPopper } from "lucide-react"
import Link from "next/link"
import { AuthCardBrand } from "@/components/auth-card-brand"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = {
  title: "Account activated",
  description: "Your account has been activated. Sign in to continue.",
}

// Landing page for a freshly activated account. The activation flow signs the
// visitor out of whatever session they had and sends them here, so the only
// action is "go to sign in" — no auto-redirect, no stale session left behind.
export default function ActivatedPage() {
  return (
    <main
      id="main-content"
      className="bg-background flex min-h-screen flex-col"
    >
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle className="bg-background/80 backdrop-blur" />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-col items-center gap-3 text-center">
              {/* Inside the card rather than floating above it, and visible at
                  every width: this page has no large-screen brand panel. */}
              <AuthCardBrand center hideOnLarge={false} />
              <div className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 flex size-12 items-center justify-center rounded-full border">
                <PartyPopper className="size-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex flex-col gap-1">
                <CardTitle className="text-2xl" data-testid="activated-title">
                  Welcome aboard!
                </CardTitle>
                <CardDescription>
                  Your account is confirmed and ready to use.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p
                className="text-muted-foreground text-sm"
                data-testid="activated-message"
              >
                You have been signed out so you can sign in with the account you
                just activated.
              </p>
              <Button
                className="w-full"
                nativeButton={false}
                render={
                  <Link href="/login" data-testid="activated-continue">
                    Continue to sign in
                  </Link>
                }
              />
              <p className="text-muted-foreground text-center text-xs">
                Wrong account?{" "}
                <Link
                  href="/register"
                  className="font-medium underline"
                  data-testid="activated-register"
                >
                  Register a new one
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <PublicFooter />
    </main>
  )
}
