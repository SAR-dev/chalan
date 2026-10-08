# Merchant API

Programmatic access for high-volume merchants. Create keys at **{{APP_URL}}/merchant/settings** → **API keys**.

## Authentication

Send your key as a bearer token:

```
Authorization: Bearer chl_live_…
```

Keys are scoped (`orders:read`, `orders:write`, `webhooks:read`, `webhooks:write`). An empty scope list means read-nothing. A revoked or unknown key returns 401 with `WWW-Authenticate: Bearer`.

## Orders

### POST /api/v1/orders — create

Accepts the same fields as the portal form, plus `recipientMail` (the customer's email, used for delivery notifications). Idempotent: send `Idempotency-Key: <uuid>` and a retry returns the original order instead of booking a second parcel.

Example:

```bash
curl -X POST {{APP_URL}}/api/v1/orders \
  -H "Authorization: Bearer chl_live_…" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocationId": "loc_…",
    "recipientName": "Ayesha Rahman",
    "recipientPhone": "01712345678",
    "recipientMail": "customer@example.com",
    "deliveryAddress": "House 12, Dhanmondi, Dhaka",
    "deliveryCityId": "city_…",
    "parcelWeightKg": 1.5,
    "productCost": 1250
  }'
```

### GET /api/v1/orders — list

Paginated, same `?q=&status=&limit=&offset=` as the portal. Only your merchant's orders are returned.

## Webhooks

Register an https URL at **/merchant/settings**. We POST a signed JSON body on every order event:

```
POST https://your.example.com/hooks/chalan
x-chalan-event: order.delivered
x-chalan-delivery: evt_…
x-chalan-timestamp: 1700000000
x-chalan-signature: v1=<hex>
{"id":"evt_…","type":"order.delivered","createdAt":"…","data":{"id":"ORD-…","status":"DELIVERED",…}}
```

Verify `x-chalan-signature` with HMAC-SHA256 over `<timestamp>.<raw body>` using your endpoint secret. The timestamp is inside the signed string so a captured delivery cannot be replayed with a fresh timestamp. Failed deliveries are parked as `FAILED` and visible in your log — reconcile by polling `GET /api/v1/orders` rather than retrying. Endpoints auto-disable after 10 consecutive failures.

Events: `order.created`, `order.approved`, `order.dispatched`, `order.picked-up`, `order.out-for-delivery`, `order.delivered`, `order.failed`, `order.returned`, `order.cancelled`.

## OpenAPI

Machine-readable spec at `{{APP_URL}}/api/v1/openapi`.
