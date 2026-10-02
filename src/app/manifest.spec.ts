import { describe, expect, it } from "vitest"
import manifest from "./manifest"

// The manifest claimed installability while leaving out the
// fields that decide *which* app an installed shortcut belongs to.

describe("PWA manifest (ROADMAP R5.6)", () => {
  const webAppManifest = manifest()

  it("pins an id, so a redeploy is not treated as a different app", () => {
    // Without `id` the browser derives one from `start_url`, so pointing the
    // deploy elsewhere - or moving the landing path - strands the installed
    // shortcut's data, icon position and notifications. It must agree with the
    // URLs the manifest already claims, or the three could drift apart.
    expect(webAppManifest.id).toBe("/")
    expect(webAppManifest.id).toBe(webAppManifest.start_url)
    expect(webAppManifest.scope).toBe("/")
  })

  it("declares its language, orientation and category", () => {
    // `lang` is read by the OS and by store listings; the app renders English
    // (`lang="en"` on the root element), so the manifest must not leave it
    // implicit.
    expect(webAppManifest.lang).toBe("en")

    // Responsive, not phone-shaped: admins run this from a desktop, riders
    // from a handset, and neither should be locked into an orientation at
    // install time.
    expect(webAppManifest.orientation).toBe("any")

    expect(webAppManifest.categories).toContain("business")
    expect(webAppManifest.categories?.length).toBeGreaterThan(0)
  })

  it("still offers an installable, branded entry", () => {
    expect(webAppManifest.display).toBe("standalone")
    expect(webAppManifest.name).toBeTruthy()
    expect(webAppManifest.background_color).toBeTruthy()
    expect(webAppManifest.theme_color).toBeTruthy()
    // Without a maskable icon the launcher crops a rectangular one on Android.
    expect(webAppManifest.icons?.some((i) => i.purpose === "maskable")).toBe(
      true,
    )
    expect(webAppManifest.icons?.some((i) => i.sizes === "512x512")).toBe(true)
  })
})
