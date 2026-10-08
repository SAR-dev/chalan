import { expect, test } from "@playwright/test"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import { dialog, labelDesigner } from "../selectors"

/**
 * The R5 label designer: the superadmin-only screen that composes the
 * platform-wide parcel label and publishes versions of it. The quick-print
 * action (see `38-print-label.spec.ts`) reads whatever this screen publishes.
 *
 * The Design tab is the pdfme free canvas. One scenario walks the whole
 * lifecycle — edit on the canvas, preview against sample data, save the draft,
 * publish, load the version back — because the value is in the pipeline, not
 * in any single control. The canvas itself (pdfme's `Designer`) is covered by
 * unit smoke tests; here we assert its seams: mount, palette, save payload.
 */

test.describe("3901. Label designer", () => {
  test("a super admin edits, previews and publishes a label version", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/label-designer")
    await waitForAppReady(page)

    // The editor seeds from the API (or the built-in default) as a pdfme
    // template; the canvas host mounts once the label font has loaded, and
    // pdfme's Designer renders its own DOM subtree into it.
    await expect(page.locator(labelDesigner.name)).toBeVisible({
      timeout: 15_000,
    })
    const canvas = page.locator(labelDesigner.canvas)
    await expect(canvas).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(() => canvas.evaluate((el) => el.childElementCount), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)

    // The palette reads the live template: the default label already carries
    // a QR, so a second one is refused with a toast…
    await page.locator(labelDesigner.addQr).click()
    await expect(toast(page, /already on the label/)).toBeVisible()

    // …while a field that isn't on the label yet is added — and is then
    // refused too, which proves the first click landed in the form's
    // template rather than only in the canvas internals.
    const siteName = page.locator(labelDesigner.addField("siteName"))
    await siteName.click()
    await siteName.click()
    await expect(
      toast(page, /"Brand name" is already on the label/),
    ).toBeVisible()

    // The template name is what history will remember this edit by.
    await page.locator(labelDesigner.name).fill("Canvas parcel label")

    // The preview tab renders through the PDF engine — the same generator the
    // print action uses — not through the DOM renderer.
    await page.locator(labelDesigner.tabPreview).click()
    const preview = page.locator(labelDesigner.previewRenderer)
    await expect(preview).toBeVisible()
    await expect
      .poll(() => preview.evaluate((el) => el.childElementCount), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)

    // Publish persists the draft first — its payload *is* the canvas state —
    // then appends a new live version.
    const saveRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/api/admin/label-template") &&
        req.postDataJSON()?.template != null,
      { timeout: 30_000 },
    )
    await page.locator(labelDesigner.publish).click()
    await expect(page.locator(dialog.confirm)).toBeVisible()
    await page.locator(dialog.confirmButton).click()
    const saved = await saveRequest
    const payload = saved.postDataJSON() as {
      name: string
      engine: string
      template: { schemas: Array<Array<{ name: string }>> }
    }
    expect(payload.name).toBe("Canvas parcel label")
    expect(payload.engine).toBe("pdfme")
    expect(payload.template.schemas[0].map((s) => s.name)).toContain("siteName")
    await expect(toast(page, /Published/)).toBeVisible({ timeout: 15_000 })

    // The published version is now the live one in history — and, being a
    // pdfme row, it loads back into the canvas.
    await page.locator(labelDesigner.tabHistory).click()
    const row = page.locator(labelDesigner.versionRow(1))
    await expect(row).toBeVisible()
    await expect(row).toContainText("Canvas parcel label")
    await expect(row).toContainText("Live")
    const load = page.locator(labelDesigner.loadVersion(1))
    await expect(load).toBeEnabled()
    await load.click()
    await expect(toast(page, /Loaded v1/)).toBeVisible()
  })
})
