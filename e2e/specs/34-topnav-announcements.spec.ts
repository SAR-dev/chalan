import { expect, test } from "@playwright/test"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import {
  announcementForm,
  announcements,
  auth,
  nav,
  signOut,
  topnav,
} from "../selectors"

// ─── 3401. TopNav & RightNav ─────────────────────────────────────────────────
//
// The header replaced the sidebar footer + mobile header as the home of the
// account actions. These tests pin the three surfaces that did not exist
// before: menu search (command palette), the avatar → RightNav panel, and the
// sign-out route through it (2901/2902 cover the confirmation itself).

test.describe("3401. TopNav & RightNav", () => {
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
    // "rightnav") render here — Help for every role. Admin keeps Support in
    // its sidebar (it is a ticket queue, not a help link), and its feed nav
    // entry is retired (the manage page owns the slot; the bell links to the
    // feed directly).
    await expect(
      panel.locator("[aria-label='Help and resources']"),
    ).toBeVisible()
    await expect(panel.locator("[data-testid='rightnav-/help']")).toBeVisible()
    await expect(
      panel.locator("[data-testid='rightnav-/dashboard/support']"),
    ).toHaveCount(0)
    await expect(
      panel.locator("[data-testid='rightnav-/dashboard/announcements-inbox']"),
    ).toHaveCount(0)
    // …and the sidebar holds neither Help nor the retired feed entry…
    await expect(
      page.locator(nav.sidebar).locator("[data-testid='nav-/help']"),
    ).toHaveCount(0)
    await expect(
      page
        .locator(nav.sidebar)
        .locator("[data-testid='nav-/dashboard/announcements-inbox']"),
    ).toHaveCount(0)
    // …but does hold the manage page.
    await expect(
      page
        .locator(nav.sidebar)
        .locator("[data-testid='nav-/dashboard/announcements']"),
    ).toBeVisible()
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

// ─── 3402. Announcements (badge, popover, feed, detail page, markdown) ────────
//
// Announcements are a board, not a notification feed: the badge counts
// announcements published since `profile.announcementsSeenAt`, and that
// watermark is stamped by *reading the board* — on the desktop by opening the
// popover, anywhere by visiting the feed — and nothing is ever hidden by
// having "seen" it. The reload assertions are the cross-device proof —
// server state, not a per-browser localStorage key.

test.describe("3402. Announcements", () => {
  test("opening the bell drains the badge, and it stays drained across a reload", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Clean watermark, then one fresh announcement: the badge has exactly one
    // contributor — this test's own row — so neither earlier specs nor the
    // seed can perturb the count.
    const seen = await page.request.post("/api/announcements/seen")
    expect(seen.ok()).toBeTruthy()
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E new-post proof",
        content: "The badge counts posts since your last feed visit.",
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
    // The only post-watermark row is the one just created → badge reads 1.
    await expect(page.locator(announcements.badge)).toHaveText("1")

    // The bell opens the reading popover — full text, no truncation — and
    // opening it stamps the watermark, so the badge drains while we watch.
    await bell.click()
    const popover = page.locator(announcements.popover)
    await expect(popover).toBeVisible()
    await expect(popover.getByText("E2E new-post proof")).toBeVisible()
    await expect(popover.getByText(/badge counts posts since/)).toBeVisible()
    await expect(page.locator(announcements.badge)).toHaveCount(0, {
      timeout: 10_000,
    })

    // The footer carries the reader from the glance panel to the full feed.
    await page.locator(announcements.popoverAll).click()
    await page.waitForURL(/\/dashboard\/announcements-inbox/)
    await expect(page.locator(announcements.inboxRow(ann.id))).toBeVisible()

    // Cross-reload: with localStorage this reset on a new browser profile;
    // the watermark lives on the profile row, so it must stay drained.
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)
    await expect(page.locator(announcements.badge)).toHaveCount(0)
    await page.reload()
    await waitForAppReady(page)
    await expect(page.locator(announcements.badge)).toHaveCount(0)

    await page.request.delete(`/api/announcements/${ann.id}`)
  })

  test("NEW pill marks what is new, then clears on the next visit", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    const seen = await page.request.post("/api/announcements/seen")
    expect(seen.ok()).toBeTruthy()
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E new pill",
        content: "Pinned for this visit only.",
        targetRoles: ["SUPER_ADMIN"],
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const ann = (await created.json()) as { id: string }

    // First visit: the pill survives the stamp (pinned at arrival), so the
    // reader can still see what was new after the badge drains.
    await page.goto("/dashboard/announcements-inbox")
    await waitForAppReady(page)
    await expect(page.locator(announcements.newPill(ann.id))).toBeVisible()
    await expect(page.locator(announcements.badge)).toHaveCount(0)

    // Second visit: the watermark predates the row now, so no pill — "new"
    // means "new since your last look", exactly once.
    await page.goto("/dashboard/orders")
    await page.goto("/dashboard/announcements-inbox")
    await waitForAppReady(page)
    await expect(page.locator(announcements.newPill(ann.id))).toHaveCount(0)

    await page.request.delete(`/api/announcements/${ann.id}`)
  })

  test("the feed stamps once; the detail page never writes", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    const seen = await page.request.post("/api/announcements/seen")
    expect(seen.ok()).toBeTruthy()
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E write-surface proof",
        content: "Exactly one watermark write, none from the detail page.",
        targetRoles: ["SUPER_ADMIN"],
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const fresh = (await created.json()) as { id: string }

    // Count every announcement-scoped POST the browser issues.
    const posts: string[] = []
    page.on("request", (req) => {
      if (req.method() === "POST" && /\/api\/announcements\//.test(req.url())) {
        posts.push(req.url())
      }
    })

    await page.goto("/dashboard/announcements-inbox")
    await waitForAppReady(page)
    await expect(page.locator(announcements.inboxRow(fresh.id))).toBeVisible()
    await expect
      .poll(() => posts.filter((u) => u.includes("/seen")).length, {
        timeout: 10_000,
      })
      .toBe(1)

    // The detail page renders content without any consumption tracking —
    // viewing one announcement must not advance the feed watermark.
    await page.goto(`/announcements/${fresh.id}`)
    await expect(page.locator(announcements.body)).toBeVisible()
    await waitForAppReady(page)
    expect(posts.filter((u) => u.includes("/announcements/"))).toHaveLength(1)

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

  test("feed rows link to the detail page", async ({ page }) => {
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
    // "Go back" = one history entry: we came from the feed, so we land back
    // on the feed (not a fixed href — the same button covers whatever led
    // here). Wait for the feed URL, not /announcements/, which the detail
    // page itself matches.
    await page.locator(announcements.back).click()
    await page.waitForURL(/\/dashboard\/announcements-inbox/)
    await expect(page.locator(announcements.inboxRow(annId))).toBeVisible()
  })

  test("admin creates an announcement on the new page and edits it on the edit page", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/announcements")
    await waitForAppReady(page)

    // ── Create ─────────────────────────────────────────────────────────────
    await page.locator(announcementForm.newLink).click()
    await page.waitForURL(/\/dashboard\/announcements\/new/)
    await expect(page.locator(announcementForm.title)).toBeVisible()

    const stamp = Date.now()
    const title = `E2E page-created ${stamp}`
    await page.locator(announcementForm.title).fill(title)
    await page
      .locator(announcementForm.content)
      .fill("## Made on the page\n\n- via the create page, not a dialog")
    // Left as a draft (no publish date) on purpose: the manage list shows
    // drafts, so the flow needs no datetime-local gymnastics.
    await page.locator(announcementForm.role("SUPER_ADMIN")).click()
    await page.locator(announcementForm.submit).click()

    await page.waitForURL(/\/dashboard\/announcements$/)
    await expect(toast(page, /created/i)).toBeVisible()

    // ── Edit ───────────────────────────────────────────────────────────────
    // Resolve the fresh row's id through the API, then drive the list UI:
    // search narrows the server-paginated table to the one row.
    const list = await page.request.get(
      `/api/announcements?q=${encodeURIComponent(title)}`,
    )
    expect(list.ok()).toBeTruthy()
    const rows = (await list.json()) as { data: Array<{ id: string }> }
    const created = rows.data[0]
    expect(created, "created announcement should be listed").toBeTruthy()
    const id = created!.id

    await page.locator(announcementForm.search).fill(title)
    const row = page.locator(
      `[data-testid='row-dashboard-announcements-${id}']`,
    )
    await expect(row).toBeVisible()

    await page.locator(announcementForm.rowActions(id)).click()
    await page.locator(announcementForm.editItem).click()
    await page.waitForURL(new RegExp(`/dashboard/announcements/${id}/edit`))
    // The form arrives prefilled, not empty.
    await expect(page.locator(announcementForm.title)).toHaveValue(title)

    const newTitle = `${title} (edited)`
    await page.locator(announcementForm.title).fill(newTitle)
    await page.locator(announcementForm.submit).click()

    await page.waitForURL(/\/dashboard\/announcements$/)
    await expect(toast(page, /updated/i)).toBeVisible()
    // Fresh page load resets the search box — narrow again, then the row
    // must carry the edited title.
    await page.locator(announcementForm.search).fill("(edited)")
    await expect(
      page.locator(`[data-testid='row-dashboard-announcements-${id}']`),
    ).toContainText("(edited)")

    // ── Cleanup ────────────────────────────────────────────────────────────
    const del = await page.request.delete(`/api/announcements/${id}`)
    expect(del.ok()).toBeTruthy()
  })
})
