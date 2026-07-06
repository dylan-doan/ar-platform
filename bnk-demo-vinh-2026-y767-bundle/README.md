# BnK Demo Vinh 2026 — headless export bundle

A standalone microsite for this event. **All business logic stays on the
Zoustec platform** — this bundle is a detachable UI shell that calls the
platform API.

## Run

Serve the folder over HTTP(S) anywhere (any static host):

    python3 -m http.server 8080
    # open http://localhost:8080

⚠️ The platform must allow your host in its CORS configuration
(`CORS_ORIGINS`). Ask the platform operator to add your origin.

## What this bundle CAN do
- Show live event info, branding, and type-specific content (from the platform API)
- Sign users in (LINE ID token, or dev name when the platform runs in dev mode)
- Run the task flow: QR code entry + GPS check → collect stamps → progress & reward

## What it CANNOT do (by design — logic stays on the platform)
- Work offline or with the platform down
- Verify QR/GPS locally, issue stamps, or store any data itself
- Run the in-page AR experience (WebAR assets/tracking are served by the
  platform; the AR step opens the platform task page)
- Access other events or other tenants (the export key is scoped to this event,
  read-only, and revocable by the tenant admin)

Platform API: https://informed-catherine-adopt-jersey.trycloudflare.com
