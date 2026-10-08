/**
 * The template's `logoRef` (an upload path) as the data URI pdfme's image
 * plugin needs. Fetch is same-origin, so no CORS handling; the conversion is
 * cached per path for the session because the same logo backs every label
 * printed from a list.
 */
const cache = new Map<string, string>()

export async function fetchLogoDataUri(
  path: string,
): Promise<string | undefined> {
  const cached = cache.get(path)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(path)
    if (!res.ok) return undefined
    const blob = await res.blob()
    const dataUri = await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
    if (dataUri) cache.set(path, dataUri)
    return dataUri
  } catch {
    return undefined
  }
}
