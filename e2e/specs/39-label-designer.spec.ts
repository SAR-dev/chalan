import { expect, test } from "@playwright/test"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import { dialog, labelDesigner } from "../selectors"

/**
 * The R5 label designer: the superadmin-only screen that composes the
 * platform-wide parcel label and publishes versions of it. The quick-print
 * action (see `38-print-label.spec.ts`) reads whatever this screen publishes.
 *
 * One scenario walks the whole lifecycle — edit, preview against sample data,
 * save the draft, publish, and see the new version in history — because the
 * value is in the pipeline, not in any single control.
 */

test.describe("3901. Label designer", () => {
  test("a super admin edits, previews and publishes a label version", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/label-designer")
    await waitForAppReady(page)

    // The editor seeds from the API (or the built-in default) and the design
    // tab previews it against the sample order immediately.
    await expect(page.locator(labelDesigner.name)).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator(labelDesigner.inlinePreview)).toContainText(
      "ORD-100001",
    )

    // Add a block: the stack is the label, so an edit must add a row.
    const rows = page.locator(labelDesigner.blockRowPrefix)
    const before = await rows.count()
    await page.locator(labelDesigner.addBlock("spacer")).click()
    await expect(rows).toHaveCount(before + 1)

    // Preview renders the same blocks at true physical size.
    await page.locator(labelDesigner.tabPreview).click()
    const preview = page.locator(labelDesigner.previewRenderer)
    await expect(preview).toBeVisible()
    await expect(preview).toContainText("ORD-100001")

    // Publish persists the draft first, then appends a new live version.
    await page.locator(labelDesigner.publish).click()
    await expect(page.locator(dialog.confirm)).toBeVisible()
    await page.locator(dialog.confirmButton).click()
    await expect(toast(page, /Published/)).toBeVisible({ timeout: 15_000 })

    // The published version is now the live one in history.
    await page.locator(labelDesigner.tabHistory).click()
    await expect(
      page.locator(labelDesigner.versionPrefix).filter({ hasText: "Live" }),
    ).toBeVisible()
  })
})
