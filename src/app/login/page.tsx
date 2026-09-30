import { Loader2 } from "lucide-react"
import { Suspense } from "react"
import { seededDevSignIns } from "@/lib/dev-mode"
import { LoginForm } from "./login-form"

// Server component so the demo account list is resolved here and only the
// resulting entries (empty on a production deployment) are handed to the form.
// See src/lib/dev-mode.ts.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      }
    >
      <LoginForm seededSignIns={seededDevSignIns()} />
    </Suspense>
  )
}
