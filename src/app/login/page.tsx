import { Loader2 } from "lucide-react"
import { Suspense } from "react"
import { seededSignIns } from "@/lib/next-mode"
import { LoginForm } from "./login-form"

// Server component so NEXT_MODE stays off the client bundle: the flag is
// resolved here and only the resulting list (empty in production) is handed to
// the form. See src/lib/next-mode.ts.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      }
    >
      <LoginForm seededSignIns={seededSignIns()} />
    </Suspense>
  )
}
