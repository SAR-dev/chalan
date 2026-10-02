import { expect, test } from "@playwright/test"
import { CREDS } from "../helpers"

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

// The two storage backends hand back the same object under two different URL
// shapes (see src/lib/storage/index.ts):
//
//   local — /uploads/{key}, served through the app's uploads/[...path] route
//   r2    — {R2_PUBLIC_URL}/{key}, served by the bucket itself
//
// So the assertions below are written against the *key* (provider-relative and
// identical either way), and the read-authorization checks only run on local —
// on R2 the object is served by the bucket, so who can read it is a bucket-ACL
// (ops) concern, not something this route can assert.
const LOCAL_PREFIX = "/uploads"

function isLocalUrl(url: string): boolean {
  return url.startsWith("/")
}

/** The provider-relative object key, whichever backend produced `url`. */
function storageKey(url: string): string {
  if (isLocalUrl(url)) return url.slice(LOCAL_PREFIX.length + 1)
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "")
  // A custom domain may carry a path prefix, so strip the configured base
  // rather than assuming the URL is just host + key.
  if (base && url.startsWith(`${base}/`)) return url.slice(base.length + 1)
  return new URL(url).pathname.replace(/^\/+/, "")
}

// ─── S44. Upload authorization ───────────────────────────────
test.describe("S44. Upload authorization", () => {
  test("anonymous uploads need a token, and NID files are not public", async ({
    request,
  }, testInfo) => {
    const file = {
      name: "nid.png",
      mimeType: "image/png",
      buffer: PNG,
    }

    // Non-NID folders require a session. (App-level authz — same on any backend.)
    const anonymousAvatar = await request.post("/api/uploads", {
      multipart: { folder: "avatars", file },
    })
    expect(anonymousAvatar.status()).toBe(401)

    // The rider-application NID flow is anonymous but needs a signed token.
    const noToken = await request.post("/api/uploads", {
      multipart: { folder: "nids", file },
    })
    expect(noToken.status()).toBe(403)

    // The token endpoint issues a short-lived token.
    const tokenRes = await request.post("/api/uploads/token")
    expect(tokenRes.ok()).toBeTruthy()
    const { token } = await tokenRes.json()
    expect(typeof token).toBe("string")

    // Bytes decide the type: a non-image is rejected even with a valid token.
    const notAnImage = await request.post("/api/uploads", {
      multipart: {
        folder: "nids",
        uploadToken: token,
        file: {
          name: "evil.png",
          mimeType: "image/png",
          buffer: Buffer.from("<html>"),
        },
      },
    })
    expect(notAnImage.status()).toBe(400)

    // A real image with the token is stored under the anonymous namespace.
    const uploaded = await request.post("/api/uploads", {
      multipart: { folder: "nids", file, uploadToken: token },
    })
    expect(uploaded.status()).toBe(200)
    const { url } = (await uploaded.json()) as { url: string }

    // The namespace + generated filename are provider-independent.
    expect(storageKey(url)).toMatch(/^nids\/public\/[0-9a-f-]{36}\.png$/)

    if (!isLocalUrl(url)) {
      // R2: the object is addressed through the configured public base, and
      // reads bypass the app — so the owner-or-admin gate and the `private`
      // cache header cannot be asserted over HTTP here. Keeping them honest on
      // R2 is the private-bucket ACL (see docs/ENV.md → Storage).
      const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "")
      expect(
        base,
        "R2_PUBLIC_URL must be set when STORAGE_PROVIDER=r2",
      ).not.toBe("")
      expect(url.startsWith(`${base}/`)).toBe(true)
      testInfo.annotations.push({
        type: "note",
        description:
          "R2 backend: read authorization is the bucket ACL, not the app route",
      })
      return
    }

    // local: the stored NID is served by the app, which must refuse it…
    const anonymousRead = await request.get(url)
    expect(anonymousRead.status()).toBe(401)

    // …but a NID reviewer can read it (private cache, never shared caches).
    const signIn = await request.post("/api/auth/sign-in/email", {
      data: {
        email: CREDS.superAdmin.email,
        password: CREDS.superAdmin.password,
        callbackURL: "/dashboard",
      },
    })
    expect(signIn.ok()).toBeTruthy()

    const adminRead = await request.get(url)
    expect(adminRead.status()).toBe(200)
    expect(adminRead.headers()["cache-control"]).toContain("private")
  })
})
