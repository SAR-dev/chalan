"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { useSWRConfig } from "swr"
import { authClient } from "@/lib/auth-client"
import { homeForRole } from "@/lib/nav-config"
import type { User } from "@/lib/types"

// Re-export so client components can keep importing from use-auth while the
// canonical definition lives in the server-safe nav-config module.
export { homeForRole }

interface AuthContextValue {
  currentUser: User | null
  isReady: boolean
  login: (
    email: string,
    password: string,
  ) => Promise<{
    ok: boolean
    user?: User
    error?: string
    needsActivation?: boolean
    activationEmail?: string
    // Sign-in was intercepted by Better Auth's two-factor plugin — the caller
    // must collect a TOTP / recovery code and call verifyTwoFactor().
    needsTwoFactor?: boolean
  }>
  verifyTwoFactor: (
    code: string,
    method?: "totp" | "backup",
  ) => Promise<{
    ok: boolean
    user?: User
    error?: string
  }>
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
  updateProfileName: (name: string) => Promise<{ ok: boolean; error?: string }>
  updateProfileImage: (
    image: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
  updateProfilePhone: (
    phone: string,
  ) => Promise<{ ok: boolean; error?: string }>
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>
  updateTableRowsPerPage: (
    value: number,
  ) => Promise<{ ok: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Restore a real Better Auth session on mount, then hydrate the full
  // app-level User (role + merchant/rider/warehouse linkage) from
  // /api/users/me, which joins the `profile` table for us.
  useEffect(() => {
    async function bootstrap() {
      try {
        const { data: session } = await authClient.getSession()
        if (session) {
          const res = await fetch("/api/users/me")
          if (res.ok) {
            const user = await res.json()
            setCurrentUser(user)
          }
        }
      } finally {
        setIsReady(true)
      }
    }
    bootstrap()
  }, [])

  // Shared tail of every successful sign-in: hydrate the app-level User
  // (role + merchant/rider/warehouse linkage) from /api/users/me and apply
  // the account gates (deactivation, unverified merchant email).
  const completeSignIn = useCallback(async () => {
    const res = await fetch("/api/users/me")
    if (!res.ok) {
      return { ok: false, error: "Could not load your account." } as const
    }
    const user: User = await res.json()

    if (!user.isActive) {
      // Sign the Better Auth session back out — we don't want a session
      // cookie sitting around for a deactivated account.
      await authClient.signOut()
      return { ok: false, error: "This account has been deactivated." } as const
    }

    // Merchants must verify their email before they can log in
    if (user.role === "MERCHANT" && !user.emailVerifiedAt) {
      await authClient.signOut()
      return {
        ok: false,
        error: "activate-email",
        needsActivation: true,
        activationEmail: user.email,
      } as const
    }

    setCurrentUser(user)
    return { ok: true, user } as const
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const normalized = email.trim().toLowerCase()
      const { data, error } = await authClient.signIn.email({
        email: normalized,
        password,
      })

      if (error || !data) {
        return {
          ok: false,
          error: error?.message ?? "Invalid email or password.",
        }
      }

      // Better Auth removed the session and issued a 2FA challenge instead of
      // a session — the login page switches to the code step.
      if ((data as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
        return { ok: false, needsTwoFactor: true }
      }

      return completeSignIn()
    },
    [completeSignIn],
  )

  const verifyTwoFactor = useCallback(
    async (code: string, method: "totp" | "backup" = "totp") => {
      const trimmed = code.trim()
      if (!trimmed) {
        return { ok: false, error: "Enter the verification code." }
      }
      const { error } =
        method === "backup"
          ? await authClient.twoFactor.verifyBackupCode({ code: trimmed })
          : await authClient.twoFactor.verifyTotp({ code: trimmed })
      if (error) {
        return {
          ok: false,
          error:
            error.message ??
            (method === "backup"
              ? "That recovery code is not valid."
              : "That verification code is not valid."),
        }
      }
      return completeSignIn()
    },
    [completeSignIn],
  )

  const refreshUser = useCallback(async () => {
    const res = await fetch("/api/users/me")
    if (res.ok) {
      const user: User = await res.json()
      setCurrentUser(user)
    }
  }, [])

  const logout = useCallback(async () => {
    await authClient.signOut()
    setCurrentUser(null)
    // Drop every cached resource so the next user that signs in on this device
    // never sees stale data from the previous session.
    await mutate(() => true, undefined, { revalidate: false })
    router.push("/login")
  }, [router, mutate])

  const updateProfileName = useCallback<AuthContextValue["updateProfileName"]>(
    async (name) => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: data?.error ?? "Could not update your name.",
        }
      }
      setCurrentUser(data)
      return { ok: true }
    },
    [],
  )

  const updateProfileImage = useCallback<
    AuthContextValue["updateProfileImage"]
  >(async (image) => {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? "Could not update your photo.",
      }
    }
    setCurrentUser(data)
    return { ok: true }
  }, [])

  const updateProfilePhone = useCallback<
    AuthContextValue["updateProfilePhone"]
  >(async (phone) => {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? "Could not update your phone number.",
      }
    }
    setCurrentUser(data)
    return { ok: true }
  }, [])

  const changePassword = useCallback<AuthContextValue["changePassword"]>(
    async (currentPassword, newPassword) => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        // Keep this session alive but sign out everywhere else for safety.
        revokeOtherSessions: true,
      })
      if (error) {
        return {
          ok: false,
          error: error.message ?? "Could not change your password.",
        }
      }
      return { ok: true }
    },
    [],
  )

  const updateTableRowsPerPage = useCallback<
    AuthContextValue["updateTableRowsPerPage"]
  >(async (value) => {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableRowsPerPage: value }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? "Could not update your rows-per-page setting.",
      }
    }
    setCurrentUser(data)
    return { ok: true }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isReady,
        login,
        verifyTwoFactor,
        refreshUser,
        logout,
        updateProfileName,
        updateProfileImage,
        updateProfilePhone,
        changePassword,
        updateTableRowsPerPage,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
