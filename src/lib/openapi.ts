/**
 * OpenAPI spec for the merchant programmatic API (R2).
 *
 * Generated from the Zod schemas in `src/lib/validation.ts` so the docs and the
 * request validation can never drift: a field added to `orderCreateSchema`
 * appears here automatically.
 *
 * This is a minimal, hand-shaped 3.0 document — enough for a docs page and for
 * a merchant to generate a client. It is not built with `zod-to-openapi`
 * because that would pull a peer (`openapi3-ts`) and a codegen step for the
 * three endpoints we have.
 */

export function getOpenApiSpec(siteUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Chalan Merchant API",
      version: "1.0.0",
      description:
        "Programmatic order booking and delivery events. Authenticate with `Authorization: Bearer <api-key>`. Keys are managed at /merchant/settings.",
    },
    servers: [{ url: `${siteUrl}/api/v1`, description: "v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key (chl_live_…)",
          description: "Merchant API key. Create one at /merchant/settings.",
        },
      },
      schemas: {
        OrderCreate: {
          type: "object",
          required: [
            "pickupLocationId",
            "recipientName",
            "recipientPhone",
            "deliveryAddress",
            "deliveryCityId",
            "parcelWeightKg",
            "productCost",
          ],
          properties: {
            pickupLocationId: {
              type: "string",
              description: "Pickup location id (from /merchant/settings)",
            },
            recipientName: { type: "string", example: "Ayesha Rahman" },
            recipientPhone: { type: "string", example: "01712-345678" },
            recipientMail: {
              type: "string",
              format: "email",
              description:
                "Customer email — used for delivery notifications (R3). Optional, but recommended.",
              example: "customer@example.com",
            },
            deliveryAddress: {
              type: "string",
              example: "House 12, Dhanmondi, Dhaka",
            },
            deliveryCityId: { type: "string", description: "Delivery city id" },
            deliveryMapLink: { type: "string", format: "uri", nullable: true },
            parcelWeightKg: { type: "number", minimum: 0, example: 1.5 },
            itemType: { type: "string", nullable: true, example: "saree" },
            deliveryType: {
              type: "string",
              enum: ["STANDARD", "EXPRESS"],
              default: "STANDARD",
            },
            productCost: { type: "number", minimum: 0, example: 1250 },
            merchantNote: { type: "string", maxLength: 100, nullable: true },
          },
        },
        Order: {
          type: "object",
          properties: {
            id: { type: "string", example: "ORD-100042E" },
            status: {
              type: "string",
              enum: ["PENDING", "APPROVED", "DISPATCHED", "DELIVERED"],
            },
            trackingToken: {
              type: "string",
              description: "Public tracking token",
            },
            recipientMail: { type: "string", nullable: true },
          },
        },
        WebhookEndpoint: {
          type: "object",
          properties: {
            id: { type: "string" },
            url: { type: "string", format: "uri" },
            events: { type: "array", items: { type: "string" } },
            secret: {
              type: "string",
              description:
                "Sign each delivery with HMAC-SHA256 over <timestamp>.<body>",
            },
          },
        },
      },
    },
    paths: {
      "/orders": {
        get: {
          summary: "List orders",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "offset", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "Paginated orders" },
            "401": { description: "Invalid API key" },
          },
        },
        post: {
          summary: "Create an order",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrderCreate" },
              },
            },
          },
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              schema: { type: "string" },
              description: "Retry safety — same key returns the original order",
            },
          ],
          responses: {
            "201": { description: "Order created" },
            "400": { description: "Validation or pricing error" },
            "401": { description: "Invalid API key" },
          },
        },
      },
      "/webhooks": {
        get: {
          summary: "List webhook endpoints",
          responses: { "200": { description: "Endpoints" } },
        },
        post: {
          summary: "Register a webhook endpoint",
          responses: { "201": { description: "Created" } },
        },
      },
    },
  }
}
