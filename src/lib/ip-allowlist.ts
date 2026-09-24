export type AllowlistEntry =
  | { kind: "any" }
  | { kind: "addr"; family: 4 | 6; bytes: Uint8Array; bits: number }

export type Allowlist = readonly AllowlistEntry[] | null

const IPV4_OCTET = /^(0|[1-9][0-9]{0,2})$/
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/

function parseIPv4Bytes(ip: string): Uint8Array | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  const bytes = new Uint8Array(4)
  for (let i = 0; i < 4; i++) {
    const part = parts[i]
    if (!IPV4_OCTET.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    bytes[i] = octet
  }
  return bytes
}

function parseIPv6Bytes(ip: string): Uint8Array | null {
  const zone = ip.indexOf("%")
  const addr = zone === -1 ? ip : ip.slice(0, zone)

  const compress = addr.indexOf("::")
  let head: string[]
  let tail: string[]
  if (compress === -1) {
    head = addr.split(":")
    tail = []
  } else {
    if (addr.indexOf("::", compress + 1) !== -1) return null
    const headRaw = addr.slice(0, compress)
    const tailRaw = addr.slice(compress + 2)
    head = headRaw ? headRaw.split(":") : []
    tail = tailRaw ? tailRaw.split(":") : []
  }

  const groups: number[] = []
  const pushGroups = (parts: string[], allowTrailingV4: boolean): boolean => {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part.includes(".")) {
        if (!allowTrailingV4 || i !== parts.length - 1) return false
        const v4 = parseIPv4Bytes(part)
        if (!v4) return false
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3])
      } else {
        if (!IPV6_GROUP.test(part)) return false
        groups.push(Number.parseInt(part, 16))
      }
    }
    return true
  }

  if (!pushGroups(head, tail.length === 0)) return null
  const headCount = groups.length
  if (!pushGroups(tail, true)) return null
  const tailCount = groups.length - headCount

  if (compress !== -1) {
    const zeros = 8 - headCount - tailCount
    if (zeros < 0) return null
    groups.splice(headCount, 0, ...new Array(zeros).fill(0))
  }
  if (groups.length !== 8) return null

  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = (groups[i] >> 8) & 0xff
    bytes[i * 2 + 1] = groups[i] & 0xff
  }
  return bytes
}

function parseAddress(ip: string): { family: 4 | 6; bytes: Uint8Array } | null {
  const trimmed = ip.trim()
  if (trimmed.includes(":")) {
    const bytes = parseIPv6Bytes(trimmed)
    return bytes ? { family: 6, bytes } : null
  }
  const bytes = parseIPv4Bytes(trimmed)
  return bytes ? { family: 4, bytes } : null
}

function parseEntry(token: string): AllowlistEntry | null {
  if (token === "*") return { kind: "any" }
  const slash = token.indexOf("/")
  const addrPart = slash === -1 ? token : token.slice(0, slash)
  const addr = parseAddress(addrPart)
  if (!addr) return null
  const maxBits = addr.family === 4 ? 32 : 128
  let bits = maxBits
  if (slash !== -1) {
    const rawBits = token.slice(slash + 1)
    if (!/^[0-9]{1,3}$/.test(rawBits)) return null
    bits = Number(rawBits)
    if (bits > maxBits) return null
  }
  return { kind: "addr", family: addr.family, bytes: addr.bytes, bits }
}

function prefixMatch(ip: Uint8Array, entry: Uint8Array, bits: number): boolean {
  const fullBytes = bits >> 3
  for (let i = 0; i < fullBytes; i++) {
    if (ip[i] !== entry[i]) return false
  }
  const rest = bits % 8
  if (rest === 0) return true
  const mask = (0xff << (8 - rest)) & 0xff
  return (ip[fullBytes] & mask) === (entry[fullBytes] & mask)
}

export function parseAllowlist(raw: string | undefined): Allowlist {
  if (raw === undefined) return null
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "")
  if (tokens.length === 0) return null
  const entries: AllowlistEntry[] = []
  for (const token of tokens) {
    const entry = parseEntry(token)
    if (entry) entries.push(entry)
  }
  return entries
}

export function ipAllowed(ip: string, list: Allowlist): boolean {
  if (list === null) return true
  if (list.some((entry) => entry.kind === "any")) return true
  const addr = parseAddress(ip)
  if (!addr) return false
  return list.some(
    (entry) =>
      entry.kind === "addr" &&
      entry.family === addr.family &&
      prefixMatch(addr.bytes, entry.bytes, entry.bits),
  )
}
