import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { announcements, auth, nav, signOut, topnav } from "../selectors"

// ─── S75. TopNav & RightNav ─────────────────────────────────────────────────
//
// The header replaced the sidebar footer + mobile header as the home of the
// account actions. These tests pin the three surfaces that did not exist
// before: menu search (command palette), the avatar → RightNav panel, and the
// sign-out route through it (S68/S72 cover the confirmation itself).

test.describe("S75. TopNav & RightNav", () => {
  test("menu search filters nav items and Enter navigates", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await expect(page.locator(topnav.root)).toBeVisible()

    // Open the palette and narrow it to one page.
    await page.locator(topnav.searchTrigger).click()
    await expect(page.locator(topnav.paletteInput)).toBeVisible()
    await page.locator(topnav.paletteInput).fill("payout")

    const payoutItem = topnav.paletteItem("/dashboard/payouts")
    await expect(page.locator(payoutItem)).toBeVisible()
    // Filtering is exclusive: an unrelated nav item must not be offered.
    await expect(
      page.locator(topnav.paletteItem("/dashboard/riders")),
    ).toHaveCount(0)

    await page.locator(topnav.paletteInput).press("Enter")
    await page.waitForURL(/\/dashboard\/payouts/)
    await waitForAppReady(page)
    expect(page.url()).toContain("/dashboard/payouts")
  })

  test("a query with no matches shows the empty state, not a blank list", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard")
    await waitForAppReady(page)

    await page.locator(topnav.searchTrigger).click()
    await page.locator(topnav.paletteInput).fill("zzz-no-such-page")
    await expect(page.locator(topnav.paletteEmpty)).toBeVisible()
  })

  test("avatar opens the RightNav panel with identity and account link", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await page.locator(topnav.userMenu).click()
    const panel = page.locator(topnav.rightnav)
    await expect(panel).toBeVisible()
    // The seeded admin's name — the identity block moved here from the
    // sidebar footer, so this is what proves it landed.
    await expect(page.locator(topnav.rightnavName)).not.toBeEmpty()
    await expect(page.locator(topnav.rightnavAccount)).toBeVisible()

    // Help & resources: the utility items the sidebar skipped (placement:
    // "rightnav") render here — Help and Inbox for every role. Admin keeps
    // Support in its sidebar (it is a ticket queue, not a help link).
    await expect(
      panel.locator("[aria-label='Help and resources']"),
    ).toBeVisible()
    await expect(panel.locator("[data-testid='rightnav-/help']")).toBeVisible()
    await expect(
      panel.locator("[data-testid='rightnav-/dashboard/announcements-inbox']"),
    ).toBeVisible()
    await expect(
      panel.locator("[data-testid='rightnav-/dashboard/support']"),
    ).toHaveCount(0)
    // …and the sidebar no longer lists them.
    await expect(
      page.locator(nav.sidebar).locator("[data-testid='nav-/help']"),
    ).toHaveCount(0)
  })

  test("RightNav sign out goes through the confirmation (links stay inert)", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await page.locator(topnav.userMenu).click()
    await page.locator(auth.logout).click()
    // The panel closes first, then the confirmation appears over the page —
    // if the dialog had been mounted inside the sheet it would be gone now.
    await expect(page.locator(signOut.dialog)).toBeVisible()
    await page.locator(signOut.cancel).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("sidebar renders nav only — account footer is gone", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    // The old sidebar footer carried avatar + theme + sign out; the sidebar
    // is nav-only now, and the closed RightNav Sheet means no sign-out
    // control is mounted anywhere until the avatar is clicked.
    const sidebar = page.locator(nav.sidebar)
    await expect(sidebar).toBeVisible()
    await expect(sidebar.locator(auth.logout)).toHaveCount(0)
    await expect(page.locator(auth.logout)).toHaveCount(0)
    // …and it becomes reachable through the avatar (panel opens mounted).
    await page.locator(topnav.userMenu).click()
    await expect(page.locator(auth.logout)).toBeVisible()
  })
})

// ─── S76. Announcements (bell, detail page, markdown) ───────────────────────
//
// Read state moved from localStorage to the announcement_read table. The
// reload assertion below is the cross-device proof: after a full page reload
// (new storage, same account) the badge must still be cleared — impossible
// with the old per-browser key.

test.describe("S76. Announcements", () => {
  test("reading an announcement clears the badge across a reload (server-side state)", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Deterministic setup: mark everything live as read, then create one
    // fresh announcement. The badge now has exactly one contributor — this
    // test's own row — so neither earlier specs nor the seed can perturb it.
    const markAll = await page.request.post("/api/announcements/read-all")
    expect(markAll.ok()).toBeTruthy()
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E unread proof",
        content: "Read state must survive a reload.",
        targetRoles: ["SUPER_ADMIN"],
        // publishedAt (not null) is what makes it live: without it the row is
        // a draft and never reaches the bell.
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const ann = (await created.json()) as { id: string }

    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    const bell = page.locator(announcements.bell)
    await expect(bell).toBeVisible()
    // The only unread row is the one just created → badge reads exactly 1.
    await expect(page.locator(announcements.badge)).toHaveText("1")

    // Open it from the bell; the detail page marks it read.
    await bell.click()
    await expect(page.locator(announcements.list)).toBeVisible()
    await page.locator(announcements.item(ann.id)).click()
    await page.waitForURL(new RegExp(`/announcements/${ann.id}`))
    await waitForAppReady(page)
    await expect(page.locator(announcements.body)).toBeVisible()
    await expect(page.locator(announcements.back)).toBeVisible()

    // Cross-reload: with localStorage this reset on a new browser profile; with
    // announcement_read the server remembers, so the badge must stay gone.
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)
    await expect(page.locator(announcements.badge)).toHaveCount(0)

    await page.request.delete(`/api/announcements/${ann.id}`)
  })

  test("mark all read empties the badge", async ({ page }) => {
    await login(page, CREDS.superAdmin)

    // Fresh unread row so the Mark all read control is guaranteed to show.
    const markAllFirst = await page.request.post("/api/announcements/read-all")
    expect(markAllFirst.ok()).toBeTruthy()
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E mark-all target",
        content: "Cleared in one action.",
        targetRoles: ["SUPER_ADMIN"],
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const ann = (await created.json()) as { id: string }

    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await expect(page.locator(announcements.badge)).toHaveText("1")
    const bell = page.locator(announcements.bell)
    await bell.click()
    await expect(page.locator(announcements.list)).toBeVisible()

    const markAll = page.locator(announcements.markAll)
    await expect(markAll).toBeVisible()
    await markAll.click()
    await expect(page.locator(announcements.badge)).toHaveCount(0)

    await page.keyboard.press("Escape")
    await page.request.delete(`/api/announcements/${ann.id}`)
  })

  test("detail page marks the announcement read server-side (POST fires once)", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Fresh + unread: tests 1–2 already marked every seeded row read, so a
    // seeded pick here would (correctly) fire no POST at all.
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E single-post proof",
        content: "Exactly one mark-read POST on open.",
        targetRoles: ["SUPER_ADMIN"],
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const fresh = (await created.json()) as { id: string }

    // Watch for the single mark-read POST when the page mounts.
    const readPosts: string[] = []
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/api\/announcements\/[^/]+\/read$/.test(req.url())
      ) {
        readPosts.push(req.url())
      }
    })

    await page.goto(`/announcements/${fresh.id}`)
    await waitForAppReady(page)
    await expect(page.locator(announcements.body)).toBeVisible()

    // Unread on the server when we arrived, so exactly one POST fires —
    // StrictMode's double effect is guarded by the postedRef.
    await expect
      .poll(() => readPosts.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)
    expect(readPosts.length).toBe(1)

    // Re-fetch: this id must now carry readAt on the server.
    const after = await page.request.get("/api/announcements/active")
    const afterRows = (await after.json()) as Array<{
      id: string
      readAt: string | null
    }>
    const target = afterRows.find((r) => r.id === fresh.id)
    expect(target?.readAt).toBeTruthy()

    await page.request.delete(`/api/announcements/${fresh.id}`)
  })

  test("markdown renders on the detail page for an admin-authored body", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Author an announcement whose body only makes sense rendered.
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E markdown announcement",
        content: "## Section heading\n\n- first item\n- second item",
        targetRoles: ["SUPER_ADMIN"],
      },
    })
    expect(created.ok()).toBeTruthy()
    const ann = (await created.json()) as { id: string }

    await page.goto(`/announcements/${ann.id}`)
    await waitForAppReady(page)

    // The h2 renders as a heading element, not literal "##" text — proof the
    // Markdown renderer ran rather than the raw string being shown.
    const body = page.locator(announcements.body)
    await expect(body.locator("h2")).toContainText("Section heading")
    await expect(body.locator("ul li")).toHaveCount(2)
    await expect(body).not.toContainText("## Section")

    // Cleanup: the API is idempotent per run; deleting keeps the admin
    // announcements list clean for later specs in this run.
    await page.request.delete(`/api/announcements/${ann.id}`)
  })

  test("inbox rows link to the detail page", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/announcements-inbox")
    await waitForAppReady(page)

    const row = page.locator("[data-testid^='inbox-row-']").first()
    await expect(row).toBeVisible()
    const testid = await row.getAttribute("data-testid")
    const annId = testid!.replace("inbox-row-", "")

    await row.click()
    await page.waitForURL(new RegExp(`/announcements/${annId}`))
    await expect(page.locator(announcements.body)).toBeVisible()
    // Back returns to the inbox, not a closed modal.
    await page.locator(announcements.back).click()
    await page.waitForURL(/announcements/)
  })
})
