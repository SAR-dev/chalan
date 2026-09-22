/**
 * Interactive setup — creates a single superadmin account.
 *
 * Usage: pnpm db:admin
 *
 * Run after `pnpm db:push` to bootstrap the first admin login.
 */

import "dotenv/config"
import * as readline from "node:readline"
import { siteConfig } from "@/config/site"
import { createUser, log } from "@/lib/db/seed/helpers"
import { isValidBdPhone, normalizePhone } from "@/lib/validation"

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${prompt}: `, (answer) => {
      resolve(answer.trim())
    })
  })
}

async function askPhone(rl: readline.Interface): Promise<string> {
  while (true) {
    const phone = await ask(rl, "Phone (e.g. 01XXXXXXXXX)")
    if (!phone) {
      console.error("Error: phone number is required.")
      continue
    }
    if (!isValidBdPhone(phone)) {
      console.error(
        "Error: invalid Bangladeshi phone number. Format: 01XXXXXXXXX",
      )
      continue
    }
    return normalizePhone(phone)
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log(`\n=== ${siteConfig.name} — Create Super Admin ===\n`)

  const name = await ask(rl, "Name")
  const email = await ask(rl, "Email")
  const password = await ask(rl, "Password")
  const phone = await askPhone(rl)

  rl.close()

  if (!name || !email || !password) {
    console.error("\nError: name, email, and password are all required.\n")
    process.exit(1)
  }

  console.log("")
  log("Creating superadmin account…")

  await createUser({
    name,
    email,
    password,
    phone,
    role: "SUPER_ADMIN",
    isActive: true,
  })

  console.log(`\n  Login: ${email} / ${password}\n`)
  console.log("Done ✓")
}

main().catch((err) => {
  console.error("[db:admin] ERROR:", err)
  process.exit(1)
})
