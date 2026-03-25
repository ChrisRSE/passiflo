# Passiflo

A lightweight Chrome/Edge browser extension for manual QA testing. Capture before/after screenshots, extract a clean HTML snapshot of the page, and generate a structured prompt ready to paste into Microsoft Copilot (or any AI assistant) for acceptance criteria verification or regression analysis.

---

## What It Does

Passiflo walks the tester through a three-step workflow:

1. **Setup** — Choose a check type and define what should pass
2. **Capture** — Take one or two screenshots of the active tab
3. **Output** — Copy the generated prompt and attach screenshots to your AI assistant

The extension never sends data anywhere. Everything runs locally in the browser.

---

## Check Types

**Acceptance Criteria** — Define up to 5 criteria. The generated prompt asks the AI to evaluate each one against the captured HTML, returning a PASS / FAIL / INCONCLUSIVE verdict per criterion plus a summary table.

**Regression** — Describe what you're checking for. Capture a BEFORE and AFTER snapshot. The generated prompt asks the AI to compare the two HTML snapshots region by region and report what changed.

Both modes support a **single screenshot** option when a before/after comparison isn't needed.

---

## HTML Capture Modes

| Mode | What it captures |
|------|-----------------|
| **Streamlined** (default) | Main content area, plus headers, nav bars, dialogs, modals, and cookie banners found outside it. Strips CSS classes, data attributes, and noise. |
| **Full** | Complete page DOM, stripping only script tags. Use this for deeply nested components or non-semantic layouts. |

**Token Optimise** (on by default) removes decorative SVGs, duplicate screen reader spans, and image format alternatives to reduce prompt size with no loss of structural content.

---

## Permissions

| Permission | Why |
|-----------|-----|
| `activeTab` | Capture the visible tab on demand |
| `scripting` | Extract the page HTML snapshot |
| `sidePanel` | Run as a side panel instead of a popup |
| `storage` | Persist setup state across panel opens |
| `<all_urls>` | Allow capture on any page the tester navigates to |

No external network calls are made. No data is sent to any server. Screenshots are held in memory only and cleared when the panel is closed.

---

## Installation (Local / Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the repository folder
5. Click the Passiflo icon in the toolbar to open the side panel

> Edge users: go to `edge://extensions` and follow the same steps.

---

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 114+ | Full support |
| Edge 114+ | Full support |

---

## No Dependencies

Vanilla JS only. No npm, no bundler, no CDN imports. The entire extension is plain HTML, CSS, and JavaScript — fully auditable by an IT or security team.
