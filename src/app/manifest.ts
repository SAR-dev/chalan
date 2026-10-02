import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    // Explicit on purpose: without `id` the browser derives one from
    // `start_url`, so re-pointing the deploy at another URL (or moving the
    // landing path) makes an existing install look like a *different* app —
    // its data, icon and notification registration are left behind.
    // `/` is already both `start_url` and `scope`, so the id does not
    // move when either of those does.
    id: "/",
    start_url: "/",
    scope: "/",
    lang: "en",
    // The app is responsive rather than phone-shaped: admins drive it from a
    // desktop, riders from a handset, so neither should be locked into one
    // orientation at install time.
    orientation: "any",
    // Read by app stores when the PWA is installed from a listing.
    categories: ["business", "productivity"],
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    icons: [
      {
        src: "/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
