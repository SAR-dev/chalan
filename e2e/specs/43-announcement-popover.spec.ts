import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { announcements } from "../selectors"

// ─── 4301. Desktop announcement popover ───────────────────────────────────────
//
// The megaphone's popover is a reading surface: every post renders its full
// markdown body (no excerpt, no clamp), unread splits into New from read into
// Earlier, and opening it stamps the watermark — reading the panel *is*
// reading the board. The footer then carries the reader to the full feed.

test.describe("4301. Desktop announcement popover", () => {
  test("shows the full markdown, splits New from Earlier, drains the badge", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Clean watermark, then one fresh announcement with a body only
    // rendering can prove: a heading and a tail sentence long enough that a
    // one-line excerpt could not contain it.
    const seen = await page.request.post("/api/announcements/seen")
    expect(seen.ok()).toBeTruthy()
    const tail =
      "Riders assigned to the metro zone should acknowledge the schedule " +
      "before their next pickup shift begins."
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E popover full text",
        content: `## Rider schedule update\n\n- metro zone bonus\n- effective next month\n\n${tail}`,
        targetRoles: ["SUPER_ADMIN"],
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const ann = (await created.json()) as { id: string }

    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await expect(page.locator(announcements.badge)).toHaveText("1")
    await page.locator(announcements.bell).click()

    const popover = page.locator(announcements.popover)
    await expect(popover).toBeVisible()
    // Unread splits into New — the seeded board may well have already-seen
    // rows (the clean watermark makes them all "Earlier"), so only the New
    // side is pinned here.
    await expect(popover.locator(announcements.sectionNew)).toBeVisible()
    await expect(
      popover.locator(announcements.popoverNew(ann.id)),
    ).toBeVisible()

    // The tail sentence is on screen in full — the popover never truncates.
    await expect(popover.getByText(tail)).toBeVisible()
    // The heading rendered as an <h2> inside the item: the shared Markdown
    // renderer ran rather than a plain-text excerpt being shown. Scoped to the
    // article — the panel header is an h2 too.
    await expect(
      popover.locator(announcements.popoverItem(ann.id)).locator("h2"),
    ).toContainText("Rider schedule update")

    // Opening stamped the watermark: the badge drains without leaving the page.
    await expect(page.locator(announcements.badge)).toHaveCount(0, {
      timeout: 10_000,
    })

    // …and the pill stays for this visit, even though the count is gone.
    await expect(
      popover.locator(announcements.popoverNew(ann.id)),
    ).toBeVisible()

    await page.request.delete(`/api/announcements/${ann.id}`)
  })

  test("the footer's See all carries the reader to the full feed", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await page.locator(announcements.bell).click()
    const popover = page.locator(announcements.popover)
    await expect(popover).toBeVisible()
    // The board is loaded once either a read section or the empty state is up.
    await expect(
      popover
        .locator(announcements.sectionEarlier)
        .or(popover.locator(announcements.popoverEmpty)),
    ).toBeVisible()

    await page.locator(announcements.popoverAll).click()
    await page.waitForURL(/\/dashboard\/announcements-inbox/)
    await expect(popover).toHaveCount(0)
  })
})

// ─── 4302. Below `sm` the bell is the full list ───────────────────────────────
//
// A 380px popover on a 390px phone is a modal pretending to be a panel. The
// mobile control is a plain link to the feed — same dual-control shape as the
// notification bell: both mounted, one hidden by CSS, no JS media query.

test.describe("4302. Mobile announcement bell", () => {
  test("links straight to the feed instead of opening a popover", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Clean watermark + one fresh row, so the mobile badge has something
    // specific to show and the feed has a specific row to land on.
    const seen = await page.request.post("/api/announcements/seen")
    expect(seen.ok()).toBeTruthy()
    const created = await page.request.post("/api/announcements", {
      data: {
        title: "E2E mobile bell proof",
        content: "The phone control links to the feed.",
        targetRoles: ["SUPER_ADMIN"],
        publishedAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const ann = (await created.json()) as { id: string }

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    // The phone control is the one on screen; the popover trigger is hidden.
    await expect(page.locator(announcements.bellPage)).toBeVisible()
    await expect(page.locator(announcements.badgeMobile)).toHaveText("1")
    await expect(page.locator(announcements.bell)).toBeHidden()
    await expect(page.locator(announcements.popover)).toHaveCount(0)

    await page.locator(announcements.bellPage).click()
    await page.waitForURL(/\/dashboard\/announcements-inbox/)
    await waitForAppReady(page)
    // The feed is the full list, on every breakpoint — and its mount stamps
    // the watermark, so the mobile badge drains there too.
    await expect(page.locator(announcements.inboxRow(ann.id))).toBeVisible()
    await expect(page.locator(announcements.badgeMobile)).toHaveCount(0, {
      timeout: 10_000,
    })

    await page.request.delete(`/api/announcements/${ann.id}`)
  })
})

// ─── 4303. Stamp-on-open is conditional ───────────────────────────────────────
//
// The watermark write fires only when there is something new: an already-seen
// board must issue no request at all, or every idle click would hit the
// profile row for nothing.

test.describe("4303. Announcement stamp guard", () => {
  test("opening an already-seen board issues no write", async ({ page }) => {
    await login(page, CREDS.superAdmin)

    const seen = await page.request.post("/api/announcements/seen")
    expect(seen.ok()).toBeTruthy()

    const posts: string[] = []
    page.on("request", (req) => {
      if (req.method() === "POST" && /\/api\/announcements\//.test(req.url())) {
        posts.push(req.url())
      }
    })

    await page.goto("/dashboard/orders")
    await waitForAppReady(page)

    await page.locator(announcements.bell).click()
    const popover = page.locator(announcements.popover)
    await expect(popover).toBeVisible()
    // Data has arrived (a read section or the empty state) and nothing was
    // new — the premise of "no write" is proven by the panel's own contents,
    // not by the absence of a badge that might just not have rendered yet.
    await expect(
      popover
        .locator(announcements.sectionEarlier)
        .or(popover.locator(announcements.popoverEmpty)),
    ).toBeVisible()
    await expect(popover.locator(announcements.sectionNew)).toHaveCount(0)

    expect(posts.filter((u) => u.includes("/seen"))).toHaveLength(0)
  })
})
