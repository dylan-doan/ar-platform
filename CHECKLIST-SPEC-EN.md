# Zoustec AR Specification ↔ Current System — Compliance Checklist

> Items follow the exact order of the specification document
> `Zoustec_AR_Ban_Dich_Tieng_Viet.docx`. Last updated: 2026-08-21.
>
> Status values: Done / Partially done / Not done

---

## PART 1 — OVERALL SYSTEM SPECIFICATION

### III. Three-tier architecture

| # | Requirement | Status | How it was done |
|---|---|---|---|
| III.1 | Multi-tenant: each customer keeps independent event data, user data, branding and domain configuration | Done | All customers share one system, but every record is tagged with its owner and the database itself blocks cross-access at the lowest level: one customer can never see another customer's data, even if the application has a bug. Each login session is limited to its own customer |
| III.2 | Automatically generate the website structure by event type (city tour / hiking trail / indoor mall) | Done | When creating an event the admin picks a type; the system generates the matching set of content blocks (e.g. hiking gets safety reminders and route info; shopping gets store locations). The website is published as a static site per version, so any version can be reviewed or rolled back |
| III.3 | Join via web browser and LINE LIFF, no app install | Done | The same website runs in a normal browser and inside LINE. Already live on a customer's own domain |

### IV. AI-generated 3D content

| # | Requirement | Status | How it was done |
|---|---|---|---|
| IV.1 | Upload a 2D image | Done | The AR Studio screen lets marketing staff drag-and-drop a mascot image, no technical skill required |
| IV.2 | Automatically generate a 3D model | Done | After upload, the system sends the image to an AI 3D service (currently Meshy, running in production); the model is ready within minutes. A slot is reserved to plug in Zoustec's own engine when available |
| IV.3 | Basic adjustments (color, scale) | Done | Buttons to change color/material, resize, and add walk/run animation to the character |
| IV.4 | Export for WebAR | Done | One click attaches the model to a task; the system prepares the image-recognition file right in the browser, no software to install |

### V. WebAR

| # | Requirement | Status | How it was done |
|---|---|---|---|
| V.1 | Triggered by QR scan or GPS | Done | Once the player scans the QR or confirms their location, the AR screen opens automatically |
| V.2 | Display 3D model | Done | The phone camera recognises the target image and overlays the 3D model; works directly inside LINE on both iPhone and Android |
| V.3 | Photo capture or simple interaction (optional) | Partially done | Basic interaction with the model exists; no "save photo" button yet |
| V.4 | Integration interface for Zoustec's AR engine | Done | 3D generation and AR display are cleanly separated, so Zoustec can swap in its own engine without touching the rest |

### VI. Task & stamp collection system

| # | Requirement | Status | How it was done |
|---|---|---|---|
| VI.1 | Task configuration: name, description, type, map location, completion condition | Done | Admin adds/edits/deletes tasks in the event builder: name, description, verification type (QR / GPS / combined), pin on the map, and allowed radius |
| VI.2 | GPS verification | Done | The phone sends its position, the server computes the distance to the task point and only accepts it within the radius; the actual distance is stored as evidence |
| VI.3 | QR verification | Done | Each task has its own system-generated QR code; scanning with the phone camera opens the right task inside LINE, the server validates the code before recording |
| VI.4 | Combined mode | Done | A task can require both the correct location and the correct code |
| VI.5 | Stamps and rewards | Partially done | Completing a task grants a stamp; reaching the admin-set threshold unlocks the reward automatically. Missing: if the admin lowers the threshold after a player already qualifies, the reward is not granted retroactively |

### VII. Event website creation & frontend template system (primary focus)

| # | Requirement | Status | How it was done |
|---|---|---|---|
| VII.1 | Choose template by event type | Done | Selecting the event type provides a matching layout |
| VII.2 | Customise page content | Done | Visual drag-and-drop builder with 16 block types (headline, image, map, task list, join button, …). The server re-validates everything submitted so no unknown block or malicious code gets through |
| VII.3 | Upload images and text | Done | Upload images directly in the builder; images are stored safely in the database so they survive server restarts |
| VII.4 | Automatically generate the event website | Done | Clicking "Publish" generates a static website with an immediately accessible address |
| VII.5 (primary focus) | Export the frontend template | Done | Three download options depending on the audience: (a) Next.js source bundle for engineers to extend; (b) static HTML/CSS/JS bundle identical to the live site, for tender deliverables or self-hosting; (c) JSON design file that end users can edit, re-upload, preview, then publish |
| VII.6 | Core logic still powered by the platform API | Done | A downloaded site still pulls events, tasks and stamps from the Zoustec platform through an API key issued per customer; the key can be viewed and revoked from the console |

### VIII. White-label & branding

| # | Requirement | Status | How it was done |
|---|---|---|---|
| VIII.1 | Customer logo | Done | Customers upload their logo on the admin Branding page |
| VIII.2 | Theme colour | Done | The customer picks one main colour; the system derives a full, consistent palette for the whole interface |
| VIII.3 | Custom domain | Partially done | The customer enters their domain on the Branding page, points DNS as instructed, and the site appears under that domain with automatic HTTPS. Running live. Missing: automatic domain registration with the hosting infrastructure and domain-ownership verification (currently done manually by Zoustec) |
| VIII.4 | LINE account linking | Done | Customers connect LINE themselves on the Branding page: paste the LINE Login channel's Channel ID + Secret, click once, and the system creates a dedicated LIFF pointing at the customer's domain. If not configured, the platform's shared LIFF is used; Zoustec can still do it on their behalf from the console |
| VIII.5 | Keep "Powered by Zoustec", controllable | Done | Shown by default; only the Zoustec admin can hide it per customer |

### IX. Data analytics & two-level admin

| # | Requirement | Status | How it was done |
|---|---|---|---|
| IX.1a | Customer admin: event management | Done | Dedicated dashboard and event builder per customer |
| IX.1b | Task configuration | Done | Inside the event builder |
| IX.1c | User data | Done | Members page: who joined, per-person progress |
| IX.1d | Real-time statistics | Done | Participants, stamps, per-task completion rate, refreshed on every page load |
| IX.1e | Report export | Done | Download a spreadsheet (CSV) report per event |
| IX.2a | Zoustec admin: customer management | Done | Zoustec console: create customers, create their admin accounts, issue API keys, create LIFF, set service plan |
| IX.2b | Event overview | Done | All events of all customers on one screen |
| IX.2c | Traffic aggregation | Partially done | Currently activity-based statistics (stamps per month); page views are not counted yet |
| IX.2d | Event portal | Done | The platform home page lists all open events |

### X. Portal & promotion

| # | Requirement | Status | Notes |
|---|---|---|---|
| X.1 | Show all events | Done | Platform home page |
| X.2 | Attraction recommendations | Partially done | Only an event list; no recommendation by interest or location |
| X.3 | Facebook / social sharing | Not done | No preview image/description when a link is pasted on social media, no share button |

### XI. Business model

| # | Requirement | Status | Notes |
|---|---|---|---|
| XI.1–3 | SaaS subscription / one-time event package / white-label licence | Partially done | Each customer is assigned a plan type and the console reports revenue per plan. Features are not yet restricted by plan; a detailed design is ready for review (PHAN-TICH-SUBSCRIPTION-CAPABILITY.md) |

### XII. Security & system requirements

| # | Requirement | Status | How it was done |
|---|---|---|---|
| XII.1 | Site-wide HTTPS | Done | Every address, including customers' own domains, gets an automatic HTTPS certificate |
| XII.2 | Multi-tenant data isolation | Done | The database itself blocks cross-customer access (see III.1) |
| XII.3 | Access control | Done | Three roles: player, customer admin, Zoustec admin; customer-admin and Zoustec-admin sessions are separate |
| XII.4 | Activity logging | Done | Every admin action and every task completion is logged with who, when, and evidence |
| XII.5 | Data backup | Partially done | Relies on the database provider's automatic backups; no self-managed backup schedule yet |

---

## PART 2 — LINE MODULE

### II. Required feature scope

| # | Requirement | Status | How it was done |
|---|---|---|---|
| 1 | LIFF event entry (create app, endpoint, entry from Rich Menu / button / link) | Done | Both the platform's shared LIFF and a dedicated LIFF for customer BnK are live in LINE. The customer creates their own LIFF with one click on the Branding page (or Zoustec does it from the console) |
| 2 | LINE login with backend identity verification | Done | Opening from LINE logs the user in automatically, nothing to type. The server verifies the token with LINE and creates the account on first visit; returning visits are recognised as the same person |
| 3A | QR task | Done | See VI.3 |
| 3B | GPS task | Done | See VI.2 |
| 3C | AR extensibility | Done | AR runs directly inside LINE, see V.2 |
| 4 | Admin API: task list, completions, user data | Done | A task completed in LINE shows up in admin immediately (user + task + timestamp) |
| 5 | Basic white-label at the LINE layer | Done | Each customer has its own LIFF and branded UI; different events show different colours and logos |

### III. Research & confirmation items (deliverables)

#### 1. LIFF and WebAR compatibility — Status: Done

**Specification question:** Can the camera open reliably inside the LIFF WebView? How does WebAR performance (WebGL / WebXR / third-party SDK) differ between iOS LINE and Android LINE? Is an external-browser fallback needed?

**Environment comparison:**

| Environment | Camera | WebGL | WebXR | AR runs | Real-device result |
|---|---|---|---|---|---|
| iOS — LINE in-app (LIFF) | Yes (HTTPS required) | Yes | Not available | Yes (MindAR) | Tested on a real iPhone: pass |
| Android — LINE in-app (LIFF) | Yes | Yes | Not available | Yes (MindAR) | Tested on a real Android: pass |
| iOS / Android — external browser | Yes | Yes | Unstable | Yes | Escape hatch only |
| HTTP origin (no TLS) | No | — | — | No | getUserMedia requires HTTPS |

**AR technology comparison:**

| Option | Runs in LIFF iOS | Runs in LIFF Android | Notes |
|---|---|---|---|
| WebXR | No | No | The LIFF WebView does not expose WebXR on either platform |
| Commercial SDK (8th Wall, …) | Yes | Yes | Paid; 8th Wall shut down Feb 2026 |
| WebGL + getUserMedia (MindAR + three.js) | Yes | Yes | Open source, runs anywhere with camera + WebGL |

**Decision and rationale:** Run **inside LIFF** with MindAR + three.js, using only getUserMedia + WebGL. Rationale: WebXR does not exist in LIFF, so any WebXR-based option is out; MindAR is the only option that is both free and works on both platforms inside LINE. The external browser was not chosen as the strategy because it cannot rescue camera failures (same sensor, same WebView engine) and `openExternalBrowser=1` is ignored by LINE on LIFF apps; it is kept only as an escape hatch via `liff.openWindow({external:true})`. If the camera fails entirely, players can still complete tasks by manual code entry or GPS. Measured benchmark: M4 72 fps, simulated 4x CPU slowdown 40 fps, 6x 28 fps (pass threshold 24 fps). Measurement tool: the self-scoring `/diag` page; full report in BAO-CAO-TUONG-THICH-LIFF-WEBAR.md.

#### 2. QR scanning solution — Status: Done

**Specification question:** Compare the LIFF built-in scanner, web camera + JS library, and external-scan redirect by stability / UX / development cost. Which is recommended?

| Criterion | (1) LIFF `scanCodeV2` | (2) Web camera + JS library (jsQR/ZXing) | (3) QR = URL with token, scanned by the phone/LINE camera |
|---|---|---|---|
| Stability | Low: unavailable in external browsers, differs between iOS/Android, depends on LINE version | Stable if HTTPS, but one extra camera permission prompt | Highest: no scanning code, uses the OS camera |
| UX | Good when it works | Medium (camera opens inside the page) | Best: scanning opens the right task in LIFF directly |
| Development cost | Low but needs its own fallback | Medium | Lowest: only server-side token verification |
| Security | Token must still be verified server-side | Same as (3) | Token verified + audited on the backend |

**Decision and rationale:** **Option (3).** The admin generates a QR containing a LIFF permalink plus a token; the player scans with any camera; the backend verifies the token and writes an audit entry. Rationale: most stable because it does not depend on the in-WebView camera or the LINE version, shortest UX (scan → straight into the task), lowest cost, and no weaker in security than the other two. Option (2) can be added later if the customer wants in-app scanning; it does not block acceptance.

#### 3. GPS behaviour — Status: Done

**Specification question:** Does location accuracy differ between the LIFF WebView and an external browser? What is the error range across devices? Does the permission flow require user action? What radius is recommended? What is the indoor fallback?

| Criterion | LIFF WebView | External browser |
|---|---|---|
| Location API | Same OS geolocation API | Same |
| Accuracy | No significant difference | Same |
| Permission flow | Permission follows the LINE app; if LINE's location permission is off, the web view cannot get a position either | Per-browser permission |
| User action required | Yes, a button tap triggers geolocation | Yes |

Reference error ranges: open outdoors 5–15 m; dense urban 15–50 m; indoors 20–100 m or more (unreliable).

| Context | Recommended radius |
|---|---|
| Open outdoor spot (square, park) | 50 m |
| Dense urban (old town, near high-rises) | 75–100 m |
| Indoors (mall, museum) | Do not use GPS alone; switch to QR or hybrid |

**Decision and rationale:** GPS is verified **server-side** with PostGIS `ST_DWithin`, the radius is configured per task (`radius_m`), and the player must tap "Verify location" to trigger geolocation. Rationale: checking on the server prevents client spoofing and leaves `distance_m` as evidence in the audit log; the radius is per task because error depends on context, not device; indoors use QR or hybrid because GPS is unreliable there. GPS has been tested for real inside LIFF on iPhone and Android.

#### 4. Multi-tenant strategy & LINE linking (Option A / Option B) — Status: Done

**Specification question:** Use a single shared channel (Option A) or one channel / LIFF per customer (Option B)? Recommendation for v1 and the future? Configuration guide for non-engineers?

| | Option A — shared channel (platform-owned) | Option B — one channel / LIFF per customer |
|---|---|---|
| Configuration | Once for the whole platform | Each customer creates a LINE Login Channel + LIFF app |
| White-label | Full UI branding, but the OA is still the platform's | Complete: OA + LIFF in the customer's name |
| Operating cost | Low | Higher (n channels, n tokens) |
| Current state | Live: platform LIFF `2010613964-3UzmddVV` | Live: BnK LIFF `2010638570-ZXXAqde5` on domain `vinh-bnk.mooo.com` |

**Decision and rationale:** **Both run in parallel.** Option A is the default so customers launch fast without touching the LINE Console; a customer who needs full brand ownership enables Option B for their tenant only, simply by entering their LIFF ID in branding — no architecture change. The system picks the LIFF through a fallback chain: tenant branding, then host, then the shared LIFF; the backend verifies the ID token against the tenant channel first, then the platform channel. The Option B setup guide (about 5 minutes per customer, performed by Zoustec) is in CUSTOM-DOMAIN.md.

#### 5. Automated LIFF app management via API — Status: Done

**Specification question:** Can LIFF apps be managed via API? Can LIFF configuration be created from the platform admin? If not feasible, what is the manual process?

| Task | API available | Current state |
|---|---|---|
| Create a new LINE Login Channel | No, LINE does not expose an API | Manual on the LINE Developers Console; the procedure is documented in CUSTOM-DOMAIN.md |
| Create / update / delete a LIFF app within a channel | Yes, LIFF Server API `https://api.line.me/liff/v1/apps` | Done: "自動建立 LIFF" button on the customer's Branding page (`POST /api/admin/branding/liff`, self-service) and in the Zoustec console (`POST /api/platform/tenants/{id}/liff`, assisted) |

**Decision and rationale:** Assessed as **partially feasible, and the feasible part is sufficient**. Automate what has an API (LIFF app creation) to cut manual work; keep a step-by-step manual procedure for what has none (channel creation), since that is a LINE limitation, not a system one.

#### 6. LIFF vs. LINE MINI App roadmap — Status: Done

**Specification question:** LIFF development speed? MINI App future potential? Should the architecture reserve room from the start? Will a later upgrade require refactoring?

| | LIFF | LINE MINI App |
|---|---|---|
| Development speed | Fast, no review | Must pass LINE review (weeks to months), partner requirements per market |
| Distribution | Link, Rich Menu, QR | Plus LINE's discovery section and optimised share messages |
| Technical API | LIFF SDK | Same LIFF SDK plus a few extra APIs |
| Camera / AR | getUserMedia | Same LIFF runtime; not a camera fallback |
| UI constraints | Free | Must follow LINE design guidelines |

**Decision and rationale:** **v1 uses LIFF.** Rationale: deploy immediately without waiting for review, sufficient for every entry channel (link, Rich Menu, QR); MINI App brings no technical benefit (same SDK, same camera), only an extra distribution channel. The architecture is already prepared: all LINE touch-points are wrapped in `lib/liff-client.js` (frontend) and `services/line_oidc.py` (backend), so moving to MINI App means registering the app and adjusting the header — business logic stays unchanged, no refactoring.

### IV. PoC acceptance

| # | Criterion | Status |
|---|---|---|
| 1–4 | Enter from the LINE OA → auto login and obtain userId → complete 1 QR or GPS task → result recorded in admin | Done — accepted 4/4 on real LINE, production URL |

### V. Technical constraints disclosed

| Status | Notes |
|---|---|
| Done | Sections 0, 4 and 6 of the compatibility report: iOS LINE camera limits, no WebXR, `openExternalBrowser=1` ineffective → fallback via `liff.openWindow({external:true})` |

---

## REMAINING WORK (by priority)

1. Not done: Social sharing — preview image/description when a link is pasted, and a share button per event (X.3)
2. Not done: Restrict features by service plan (XI) — design ready
3. Partially done: Count page views for traffic reporting (IX.2c)
4. Not done: Retroactive reward grant when the admin lowers the threshold (VI.5); photo capture button in AR (V.3)
5. Handover: disable test-login mode, rotate the database password and revoke the AI service key used during development, set the official Zoustec admin password, set up a self-managed backup schedule

---

Sources: TONG-KET-CONG-VIEC.md, API-UI-MAP.md,
BAO-CAO-TUONG-THICH-LIFF-WEBAR.md, CUSTOM-DOMAIN.md.
