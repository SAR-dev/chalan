import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi"
import { z } from "zod"
import { orderCreateSchema } from "@/lib/validation"

// Extend Zod with the `.openapi()` helper so schemas can carry OpenAPI metadata.
// Done once at import time; the side-effect is global to this process.
extendZodWithOpenApi(z)

/**
 * OpenAPI spec for the merchant programmatic API (R2).
 *
 * Generated from the Zod schemas in `src/lib/validation.ts` so the docs and the
 * request validation can never drift: a field added to `orderCreateSchema`
 * appears here automatically and the build fails if the shape is not OpenAPI-
 * compatible.
 *
 * The hand-shaped document this replaced had the same paths and security, but
 * was maintained by hand — a new `recipientMail` field would have been accepted
 * by the route and silently missing from the docs. Now the route and the docs
 * share the same `orderCreateSchema` instance.
 */

const registry = new OpenAPIRegistry()

// The shared validation schema — the docs and the route share the same instance,
// so a field added to `orderCreateSchema` appears in the spec automatically.
// No `.openapi()` needed here; the generator will inline the Zod shape. If we
// want an example/description, we add it via the registry's component metadata
// rather than mutating the validation schema.
const OrderCreateForDocs = orderCreateSchema

registry.registerPath({
  method: "get",
  path: "/orders",
  summary: "List orders",
  description:
    "Paginated list of your merchant's orders. Same `?q=&status=&limit=&offset=` as the portal.",
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      q: z
        .string()
        .optional()
        .openapi({ description: "Search by order id, recipient, phone" }),
      status: z.string().optional().openapi({
        description: "Comma-separated statuses, e.g. PENDING,DELIVERED",
      }),
      limit: z.coerce.number().optional().openapi({ description: "Page size" }),
      offset: z.coerce.number().optional().openapi({ description: "Offset" }),
    }),
  },
  responses: {
    200: {
      description: "Paginated orders",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(z.object({ id: z.string(), status: z.string() })),
            total: z.number(),
            limit: z.number().optional(),
            offset: z.number().optional(),
          }),
        },
      },
    },
    401: { description: "Invalid API key" },
  },
})

registry.registerPath({
  method: "post",
  path: "/orders",
  summary: "Create an order",
  description:
    "Create a single order. Idempotent via `Idempotency-Key` header.",
  security: [{ bearerAuth: [] }],
  request: {
    headers: z.object({
      "Idempotency-Key": z.string().optional().openapi({
        description: "Retry safety — same key returns the original order",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: OrderCreateForDocs,
        },
      },
    },
  },
  responses: {
    201: { description: "Order created" },
    400: { description: "Validation or pricing error" },
    401: { description: "Invalid API key" },
  },
})

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "API key (chl_live_…)",
  description: "Merchant API key. Create one at /merchant/settings.",
})

export function getOpenApiSpec(siteUrl: string) {
  const generator = new OpenApiGeneratorV3(registry.definitions)
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Chalan Merchant API",
      version: "1.0.0",
      description:
        "Programmatic order booking and delivery events. Authenticate with `Authorization: Bearer <api-key>`. Keys are managed at /merchant/settings. Spec generated from Zod schemas so the docs and the validation share the same `orderCreateSchema` instance.",
    },
    servers: [{ url: `${siteUrl}/api/v1`, description: "v1" }],
    security: [{ bearerAuth: [] }],
  })
}
