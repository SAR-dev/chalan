/**
 * The pdfme engine rollout switch (PDF.md §9 phase 4).
 *
 * The designer itself is always the pdfme free canvas — the flag does not gate
 * it. What the flag decides is the *print fallback*: when no template has ever
 * been published, off (the default) prints the built-in `DEFAULT_LABEL_TEMPLATE`
 * through the legacy blocks renderer, so nothing changes for existing
 * deployments or the e2e suite; on, the fallback is the pdfme default template.
 * A published engine always wins regardless of the flag — legacy 'blocks'
 * rows keep printing through the old renderer with no migration.
 */
export function labelPdfmeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LABEL_PDFME === "true"
}
