import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { LabelBlock } from "@/lib/validation"
import { ts } from "./helpers"

// =============================================================================
// Parcel label template (R5)
//
// One platform-wide printable parcel label, edited in the admin designer. The
// label is a vertical stack of typed blocks; `blocks` is the source of truth
// and the renderer consumes it for both screen and print (and a future vector
// PDF). It is deliberately a dedicated table rather than a `platform_config`
// key/value row because the designer needs append-only versions.
//
// There is exactly one *default* row at a time (partial unique index below).
// Publishing appends a new version rather than overwriting the old one, so a
// label a parcel was already printed with can always be reproduced.
//
// `widthMm`/`heightMm` are the only "paper" knob: the same template is scaled
// to non-thermal stock by changing them, never by maintaining a second layout.
// =============================================================================

export const labelTemplate = pgTable(
  "label_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    // The scale, in millimetres. Defaults match the 100×150mm thermal label.
    widthMm: integer("widthMm").notNull().default(100),
    heightMm: integer("heightMm").notNull().default(150),
    // Storage key for an optional logo, managed through `src/lib/storage`.
    logoRef: text("logoRef"),
    // The block stack. Typed against the Zod-inferred `LabelBlock` union in
    // `src/lib/validation.ts` so the column can never hold a shape the designer
    // and renderer don't understand.
    blocks: jsonb("blocks")
      .$type<LabelBlock[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Bumped on each publish; drafts keep the version they branched from.
    version: integer("version").notNull().default(1),
    // null = draft. Only a published row is used to print a real label.
    publishedAt: ts("publishedAt"),
    isDefault: boolean("isDefault").notNull().default(false),
    createdBy: text("createdBy"),
    updatedBy: text("updatedBy"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("label_template_published_at_idx").on(t.publishedAt),
    // Exactly one default template for the platform — mirrors the "one active
    // bundle per merchant" partial unique index on `merchant_package`.
    uniqueIndex("label_template_one_default_uniq")
      .on(t.isDefault)
      .where(sql`${t.isDefault} = true`),
  ],
)
