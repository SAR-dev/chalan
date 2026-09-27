import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained build (.next/standalone) for small Docker images.
  output: "standalone",
  // ioredis is a server-side Redis client — keep it external so it is not
  // bundled into the build (matches nodemailer etc.).
  serverExternalPackages: ["ioredis"],
  env: {},
  // Pin the workspace root to this project so Next.js doesn't pick up a
  // stray lockfile elsewhere on the machine (e.g. C:\Users\1142\package-lock.json).
  turbopack: {
    root: __dirname,
  },
  images: {
    // Uploads are served from a *dynamic* origin (local `./.uploads` or a
    // Cloudflare R2 public base URL) and are rendered through plain `<img>` in
    // `src/components/image-zoom.tsx` / `image-upload.tsx` — not `next/image`.
    // So this flag is currently inert; it is kept so that a future switch to
    // `next/image` cannot silently half-enable the optimizer (which would then
    // reject those dynamic hosts without `remotePatterns`).
    //
    // Payload size is handled at upload time instead: the uploader
    // downscales client-side to `UPLOAD_MAX_DIMENSIONS` and the API caps
    // uploads at 5MB. Moving to `next/image` is tracked in ROADMAP (P3).
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: "/merchant/business", destination: "/merchant/settings", permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // NOTE: Content-Security-Policy is NOT set here. It must carry a
          // per-request nonce for Next's inline hydration scripts, which a
          // static header can't express. It is generated in src/proxy.ts and
          // applied to page routes via its matcher.
        ],
      },
    ]
  },
}

export default nextConfig
