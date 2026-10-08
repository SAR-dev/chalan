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
      template: { schemas: Array<Array<{ name: string }>> }
    }
    expect(payload.name).toBe("Canvas parcel label")
    // pdfme is the only engine, so the save carries the canvas template and
    // nothing else — there is no `engine` field to assert on.
    expect(payload).not.toHaveProperty("engine")
    expect(payload).not.toHaveProperty("blocks")
    expect(payload.template.schemas[0].map((s) => s.name)).toContain("siteName")
    await expect(toast(page, /Published/)).toBeVisible({ timeout: 15_000 })

    // The published version is now the live one in history, and every version
    // loads back into the canvas — there is no read-only version class.
    //
    // The version number is read from the history list rather than hardcoded:
    // publishing appends `max(version) + 1` and the *draft* already holds
    // version 1, so the first live row is v2, not v1.
    await page.locator(labelDesigner.tabHistory).click()
    const row = page.locator("[data-testid^='label-version-']").first()
    await expect(row).toBeVisible()
    await expect(row).toContainText("Canvas parcel label")
    await expect(row).toContainText("Live")
    const version = ((await row.getAttribute("data-testid")) ?? "").replace(
      "label-version-",
      "",
    )
    expect(version).toMatch(/^\d+$/)
    expect(Number(version)).toBeGreaterThan(1)

    const load = page.locator(labelDesigner.loadVersion(Number(version)))
    await expect(load).toBeEnabled()
    await load.click()
    await expect(toast(page, new RegExp(`Loaded v${version}`))).toBeVisible()
  })
})
