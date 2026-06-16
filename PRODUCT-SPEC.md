# ShotPad — Product Spec

## Overview
**ShotPad** is a Chrome extension for capturing, annotating, and sharing screenshots. Fast, clean, and lightweight — the screenshot tool Awesome Screenshot should've been.

**Tagline:** "Capture. Annotate. Share."

## Target Audience
- Remote workers sharing bugs, feedback, or designs
- QA testers documenting issues
- Customer support agents capturing error screens
- Content creators grabbing web visuals
- Students capturing lecture/reference material
- Anyone who's ever needed a quick annotated screenshot

## Market Opportunity
- Awesome Screenshot: 3M+ users, charges $6/mo, bloated with features
- Lightshot: 3M+ users, dated UI, privacy concerns
- Nimbus Screenshot: 1M+ users, clunky
- GoFullPage: 2M+ users, full-page only, no annotation
- Clear gap for a fast, modern, affordable alternative

---

## Features

### Free Tier
- **Capture visible area** — Screenshot what's on screen right now
- **Capture selected region** — Click and drag to select an area
- **Capture full page** — Auto-scroll and stitch the entire page
- **Annotate** — Arrows, rectangles, circles, straight lines, freehand draw
- **Text tool** — Add text labels with customizable size and color
- **Blur/pixelate** — Redact sensitive info (emails, names, etc.)
- **Crop** — Trim screenshot after capture
- **Color picker** — Choose annotation colors (8 preset + custom)
- **Undo/Redo** — Ctrl+Z / Ctrl+Y support
- **Download** — Save as PNG or JPG
- **Copy to clipboard** — One-click copy for pasting into Slack, email, docs
- **Keyboard shortcut** — Ctrl+Shift+X to capture
- **5 cloud saves** — Store up to 5 screenshots in the cloud (shareable link)
- **Dark mode** — Matches Chrome theme

### Pro Tier — $4/mo or $29/yr
- **Unlimited cloud saves** — All screenshots stored & accessible from any device
- **Shareable links** — Generate a link to any saved screenshot (great for bug reports)
- **Screen recording** — Record tab as MP4/WebM (up to 5 min free, unlimited Pro)
- **Numbered steps** — Auto-numbered annotation circles (①②③) for tutorials
- **Callout boxes** — Highlighted text boxes with backgrounds for emphasis
- **Watermark** — Add custom watermark/logo to screenshots
- **Auto-upload** — Screenshots automatically saved to cloud after capture
- **Screenshot history** — Browse and re-download past screenshots
- **Bulk export** — Download multiple screenshots as ZIP

---

## Tech Stack
- **Extension:** Chrome Manifest V3 (HTML/CSS/JS)
- **Capture:** Chrome `chrome.tabs.captureVisibleTab` + content script scroll-stitch for full page
- **Annotation:** HTML5 Canvas editor
- **Storage (Free):** chrome.storage.local (stays on device) + 5 cloud saves via Supabase
- **Storage (Pro):** Supabase Storage (screenshots) + Supabase DB (metadata)
- **Payments:** PayPal Subscriptions (same infra as ScriptPad)
- **Auth:** Supabase Auth (email/password)
- **Sharing:** Supabase Storage public URLs with unique IDs

## UI Flow

### 1. Capture Mode (popup)
```
┌──────────────────────────────────┐
│ 📸 ShotPad              ⚙️ 👤   │
│──────────────────────────────────│
│                                  │
│  ┌────────────────────────────┐  │
│  │  📋 Visible Area          │  │
│  │  Screenshot what you see   │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  ✂️ Select Region          │  │
│  │  Click & drag to capture   │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  📄 Full Page              │  │
│  │  Capture entire page       │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  🎥 Record Tab        PRO │  │
│  │  Record screen as video    │  │
│  └────────────────────────────┘  │
│                                  │
│──────────────────────────────────│
│  Recent: 3 screenshots today     │
│  ☁️ 2/5 cloud saves used        │
└──────────────────────────────────┘
```

### 2. Editor (new tab after capture)
```
┌──────────────────────────────────────────────────────────┐
│ ShotPad Editor                    [↩ Undo] [↪ Redo]     │
│──────────────────────────────────────────────────────────│
│ ┌──────────────────────────────────────────────────────┐ │
│ │                                                      │ │
│ │                                                      │ │
│ │              [Screenshot Canvas Area]                 │ │
│ │                                                      │ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
│──────────────────────────────────────────────────────────│
│ Tools:                                                   │
│ [→ Arrow] [□ Rect] [○ Circle] [— Line] [✏️ Draw]       │
│ [T Text] [▓ Blur] [✂ Crop] [①② Steps PRO]             │
│──────────────────────────────────────────────────────────│
│ Color: 🔴🟠🟡🟢🔵🟣⚫⚪  Size: [S][M][L]              │
│──────────────────────────────────────────────────────────│
│ [📋 Copy] [💾 Download ▾] [☁️ Save to Cloud] [🔗 Share]│
└──────────────────────────────────────────────────────────┘
```

### 3. Screenshot History (popup tab)
```
┌──────────────────────────────────┐
│ 📸 ShotPad > History     ⚙️ 👤  │
│──────────────────────────────────│
│ 🔍 Search screenshots...        │
│──────────────────────────────────│
│ ┌──────┐ Bug report - login pg   │
│ │thumb │ Today 3:42 PM    🔗 ☁️ │
│ └──────┘                    ✕    │
│──────────────────────────────────│
│ ┌──────┐ Design feedback v2      │
│ │thumb │ Today 1:15 PM    🔗 ☁️ │
│ └──────┘                    ✕    │
│──────────────────────────────────│
│ ┌──────┐ Error screenshot        │
│ │thumb │ Yesterday         💾    │
│ └──────┘                    ✕    │
│──────────────────────────────────│
│          ☁️ 2/5 cloud saves      │
│       [⚡ Upgrade to Pro]        │
└──────────────────────────────────┘
```

---

## Pricing

| Feature | Free | Pro |
|---|---|---|
| Capture (visible/region/full) | ✅ | ✅ |
| Annotations (arrows, shapes, text) | ✅ | ✅ |
| Blur/pixelate | ✅ | ✅ |
| Crop | ✅ | ✅ |
| Download (PNG/JPG) | ✅ | ✅ |
| Copy to clipboard | ✅ | ✅ |
| Undo/Redo | ✅ | ✅ |
| Dark mode | ✅ | ✅ |
| Cloud saves | 5 | Unlimited |
| Shareable links | 5 | Unlimited |
| Screen recording | ❌ | ✅ |
| Numbered steps | ❌ | ✅ |
| Callout boxes | ❌ | ✅ |
| Watermark | ❌ | ✅ |
| Auto-upload | ❌ | ✅ |
| Screenshot history | ❌ | ✅ |
| Bulk export | ❌ | ✅ |
| **Price** | **Free** | **$4/mo or $29/yr** |

---

## MVP (v1.0) — Ship First
Focus on FREE features only. No accounts, no cloud, no Pro.

### v1.0 Scope:
- Capture visible area
- Capture selected region
- Capture full page (scroll-stitch)
- Editor opens in new tab after capture
- Annotations: arrow, rectangle, circle, line, freehand draw
- Text tool
- Blur/pixelate tool
- Crop tool
- Color picker (8 presets + custom)
- Line thickness (S/M/L)
- Undo/Redo
- Download as PNG
- Copy to clipboard
- Keyboard shortcut (Ctrl+Shift+X)
- Dark mode support
- Clean, modern UI

### NOT in v1.0:
- Account system / auth
- Cloud saves / upload
- Shareable links
- Screen recording
- Numbered steps / callouts
- Watermark
- PayPal / Pro tier
- Screenshot history
- JPG export option

---

## Future Versions Roadmap

### v1.1 — Polish & Feedback
- Bug fixes from real user feedback
- JPG export option
- Performance optimization for large full-page captures

### v1.2 — Account System + Cloud
- Supabase auth (email/password)
- 5 free cloud saves
- Shareable links (free: 5, Pro: unlimited)
- Screenshot history (Pro)
- Pro upgrade flow (PayPal)

### v1.3 — Pro Features Wave 1
- Unlimited cloud saves (Pro)
- Auto-upload (Pro)
- Numbered steps tool (Pro)
- Callout boxes (Pro)
- Watermark (Pro)

### v1.4 — Screen Recording
- Tab recording as WebM (Pro)
- Recording controls overlay
- Bulk export (Pro)

---

## Store Listing

**Name:** ShotPad — Screenshot & Annotate

**Short description (132 chars max):**
Capture, annotate & share screenshots instantly. Arrows, blur, text, crop — the fast screenshot tool for Chrome.

**Category:** Productivity

**Keywords/Tags:** screenshot, screen capture, annotate, markup, blur, snipping tool, screenshot editor, Awesome Screenshot alternative

---

## Competition Analysis

| Extension | Users | Weakness | Our Edge |
|---|---|---|---|
| Awesome Screenshot | 3M+ | Bloated, $6/mo, slow | Lightweight, $4/mo, fast |
| Lightshot | 3M+ | Privacy concerns, dated UI | Modern, clean, transparent |
| Nimbus Screenshot | 1M+ | Clunky interface | Simple, focused |
| GoFullPage | 2M+ | Full-page only, no editing | Full editor, all capture modes |
| Fireshot | 1M+ | Basic editor, ugly UI | Rich annotations, modern UI |

---

## Revenue Projections (Conservative)

**Month 1-3:** Free users, building reviews (0 revenue)
**Month 4-6:** Pro tier launches, 1-2% conversion
- 2,000 users × 1.5% conversion × $4/mo = $120/mo
**Month 6-12:** Growth phase
- 10,000 users × 2% conversion × $4/mo = $800/mo
**Year 2:** Established
- 50,000 users × 2.5% conversion × $4/mo = $5,000/mo

Screenshot tools have huge TAM. Awesome Screenshot got 3M users — a good modern alternative can realistically capture significant share.
