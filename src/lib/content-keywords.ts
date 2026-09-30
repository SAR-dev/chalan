import { appContent } from "@/config/site"

/**
 * Substitutes the `{{APP_NAME}}` / `{{APP_URL}}` / `{{APP_EMAIL}}` tokens that
 * content markdown may carry.
 *
 * Shared by every page that renders a file from `src/content/` (FAQ, help
 * guides, privacy, terms) so the token set can never drift between them.
 */
export function replaceContentKeywords(content: string): string {
  return content
    .replace(/\{\{APP_NAME\}\}/g, appContent.APP_NAME)
    .replace(/\{\{APP_URL\}\}/g, appContent.APP_URL)
    .replace(/\{\{APP_EMAIL\}\}/g, appContent.APP_EMAIL)
}
