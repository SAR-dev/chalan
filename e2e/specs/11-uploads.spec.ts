import { expect, test } from "@playwright/test"
import { CREDS } from "../helpers"

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

// ─── S44. Upload authorization (ROADMAP P0.2) ───────────────────────────────
test.describe("S44. Upload authorization", () => {
  test("anonymous uploads need a token, and NID files are not public", async ({
    request,
  }) => {
    const file = {
      name: "nid.png",
      mimeType: "image/png",
      buffer: PNG,
    }

    // Non-NID folders require a session.
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
    const { url } = await uploaded.json()
    expect(url).toMatch(/^\/uploads\/nids\/public\/[0-9a-f-]{36}\.png$/)

    // The stored NID is NOT world-readable…
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
