# PROJECT: Fido Note Builder v3 — Chrome Extension (Manifest V3)

## Overview

Build a Chrome Extension called **Fido Note Builder** — a floating, draggable widget injected via Shadow DOM into any website. It helps loan collection agents:

- Build structured notes from **searchable combobox dropdowns**
- Track WebRTC call duration with a **live timer**
- **Auto-detect the calling phone number** from page headers and auto-fill it into reminder forms
- Manage follow-up reminders with Chrome notifications
- **In-widget amber due popup** that appears when a reminder is due, with snooze/close actions
- Access campaign-specific call scripts
- Toggle between **light and dark themes**

## Architecture Rules

- **No build tools** — vanilla JS only, no bundler, no framework
- **Global namespace**: `window.FidoNote` — each file registers its module here
- **IIFE pattern** per file, loaded in numbered order via `manifest.json` content_scripts
- **Shadow DOM** for complete CSS isolation from host pages
- **CSS Custom Properties** for light/dark theming
- Each file should be **under 200 lines** — modular and focused

## File Structure

```
fido-note-builder/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js         # Alarms, notifications, message routing
│   ├── content/
│   │   ├── 00-namespace.js           # Init window.FidoNote = {}
│   │   ├── 01-storage.js             # Chrome storage read/write (local + session)
│   │   ├── 02-clipboard.js           # Clipboard copy with fallback
│   │   ├── 03-sheets.js              # Google Sheets CSV fetcher + parser
│   │   ├── 04-phone-detect.js        # Phone number extraction from page DOM
│   │   ├── 05-format.js              # Note string formatting
│   │   ├── 06-combobox.js            # Searchable dropdown component
│   │   ├── 07-call-timer.js          # Call timer UI component
│   │   ├── 08-task-manager.js        # Reminder CRUD operations
│   │   ├── 09-note-form.js           # Main form with comboboxes + textarea
│   │   ├── 10-suggestions.js         # Campaign suggestions tab
│   │   ├── 11-widget.js              # Widget shell: draggable, tabs, theme toggle
│   │   ├── 12-main.js               # Bootstrap, mount, wire everything together
│   │   └── webrtc-hook.js            # Page-level script (injected, NOT a content script)
│   ├── styles/
│   │   └── widget.css                # All styles with CSS custom properties
│   └── data/
│       └── options.json              # Fallback dropdown options
```

## Feature Specifications

### 1. Draggable Widget

- Fixed position, default bottom-right corner
- Drag via header bar, position persisted in `chrome.storage.local`
- Toggle button (collapsed) → full panel (expanded)
- z-index: 2147483647, max-height: 72vh with scroll
- Two tabs: **Notes** and **Suggestions**

### 2. Dark/Light Theme

- Toggle icon in header (moon/sun)
- CSS custom properties on `.fido-widget` element
- Light: white/aqua backgrounds, dark text
- Dark: #1E1E2E background, light text, muted accents
- Preference saved in `chrome.storage.local` under `fido_prefs` key

### 3. Searchable Combobox Dropdowns

- Custom component replacing `<select>` — text input + filtered dropdown list
- Arrow keys, Enter, Escape, click navigation
- Clear (×) button per field
- Dropdown closes on blur (with 150ms delay for click events)
- Fields (populated from Google Sheets CSV, fallback to `options.json`):
  - **Campaign** (with "Keep on Clear" checkbox)
  - **Outcome** (selecting auto-fills notes textarea)
  - **Payment Commitment**
  - **Understood Offer**
  - **Main Reason Category** (selecting shows question hint + auto-fills notes)

### 4. Notes Textarea + Copy

- Free-text area, 250ms debounce save to `chrome.storage.local`
- Copy button builds formatted output:

```
Time = 2026-02-13 14:30 /
Campaign = Recovery /
Outcome = Answered – Borrower /
Payment Commitment = PTP – Today /
Understood Offer = Clear (Understood offer + plan) /
Main Reason Category = Salary or Income delay /
Notes = Customer promised to pay by end of day /
```

- Uses `navigator.clipboard.writeText()` with `<textarea>` fallback
- Brief "Copied!" status flash

### 5. WebRTC Call Detection + Timer

- `webrtc-hook.js` is injected as a **page-level script** (not content script)
- Wraps `RTCPeerConnection` to monitor `connectionstatechange`
- Dispatches `CustomEvent("fido-call-state", { detail: { active, state } })`
- Timer UI in widget:
  - Idle → "No active call"
  - Connected → "Call · MM:SS" (live)
  - Disconnected → "Last call · MM:SS"

### 6. Phone Number Auto-Detection

- **Priority scraping order** when call becomes active:
  1. `h1, h2, h3, h4` — regex match for phone patterns (call platform shows number in header)
  2. `[href^='tel:']` links
  3. `input[type='tel']` or `input[name*='phone' i]`
  4. `[data-phone]` or `[data-client-phone]` attributes
  5. Full body text regex scan: `/\+?\d[\d\s()\-]{7,}\d/`
- Normalize to digits + optional leading `+`
- Store as detected phone — auto-populate reminder modal phone field
- **When a WebRTC call starts, immediately scan and fill phone**

### 7. Follow-Up Reminders

- "+" button in header opens task creation modal
- Modal fields:
  - Client/Loan ID (required)
  - Phone Number (required, **auto-filled from detected phone**)
  - Due Date/Time (required) + quick presets: "15 min", "1 hour", "Next day"
  - Note (optional, auto-filled from current notes textarea)
- Tasks stored in `chrome.storage.local` key `fido_tasks`
- `chrome.alarms.create()` for scheduling
- `chrome.notifications.create()` when due, with buttons: "Snooze 10min" | "Close"
- Task list section in Notes tab: shows active tasks with snooze/close controls

### 7b. In-Widget Due Popup (Amber Notification)

When a reminder's due time arrives, the widget shows a prominent **amber-themed popup** so the agent never misses a follow-up — even without browser notification permissions.

**Alert Badge on Toggle Button:**
- A **pulsing amber dot** (14px) appears on the top-right corner of the "Fido Note" toggle button
- The toggle button itself gets a **glowing amber box-shadow animation** that pulses continuously
- Visible even when the panel is collapsed

**Due Popup Card:**
- Positioned inside the widget (above the toggle button), amber gradient background
- Header: bell icon (with ringing animation on appear) + "Reminder Due" title + count badge ("3 due" if multiple)
- Body: Client ID (bold), phone + due time, note text
- Actions: **"Snooze 10m"** (amber outline) and **"Close Task"** (amber filled) buttons
- Slides in with a 300ms ease-out animation

**Periodic Check:**
- Every **5 seconds**, `checkDueTasks()` reads all tasks from storage
- Filters for tasks where `status !== "done"` AND `dueAt <= Date.now()`
- Shows the popup for the **oldest due task** first
- When the agent snoozes or closes a task, the popup immediately checks for the next due task
- Also re-checks whenever tasks change in storage (via `chrome.storage.onChanged`)

**Behavior Flow:**
```
Task due time arrives
  → checkDueTasks() detects it (within 5 seconds)
  → amber dot appears on toggle button (pulsing)
  → toggle button glows amber
  → amber popup slides in:
      🔔 Reminder Due          [3 due]
      LN-102938
      +233123456789 · Due 2/13/2026, 2:30 PM
      Customer promised to pay by end of day
      [Snooze 10m]  [Close Task]
  → Agent clicks "Snooze 10m" → task pushed 10min, popup hides, checks next
  → Agent clicks "Close Task" → task removed, popup hides, checks next
  → No more due tasks → popup hides, amber dot disappears, glow stops
```

**Dark Mode Support:**
- Light: warm gradient `#FFFBEB → #FEF3C7`, brown text `#78350F`, amber border `#F59E0B`
- Dark: dark amber gradient `#2A2215 → #332B1A`, golden text `#FDE68A`, deep amber border `#D97706`

**CSS Classes:**
| Class | Purpose |
|-------|---------|
| `.fn-alert-badge` | Pulsing amber dot on toggle button |
| `.fn-toggle-alert` | Glowing amber shadow on toggle button |
| `.fn-due-popup` | Amber popup container |
| `.fn-due-popup-header` | Header with bell, title, count |
| `.fn-due-popup-bell` | Bell icon with ringing animation |
| `.fn-due-popup-count` | Badge showing number of due tasks |
| `.fn-due-popup-client` | Client ID display |
| `.fn-due-popup-meta` | Phone + due time |
| `.fn-due-popup-note` | Note text with subtle background |
| `.fn-due-popup-actions` | Snooze + Close buttons row |
| `.fn-due-snooze` | Amber outline snooze button |
| `.fn-due-execute` | Amber filled close/execute button |

**Animations:**
| Animation | Duration | Purpose |
|-----------|----------|---------|
| `fn-pulse` | 1.5s infinite | Alert badge scaling |
| `fn-glow` | 2s infinite | Toggle button amber shadow |
| `fn-slide-in` | 0.3s once | Popup entrance |
| `fn-ring` | 1s, plays twice | Bell icon ringing |

### 8. Campaign Suggestions Tab

- Campaign combobox (same searchable component)
- Fetches scripts from dedicated Google Sheet CSV
- Displays script text in a styled card
- Copy button for the script
- Syncs campaign selection when switching between tabs

### 9. Google Sheets Integration

- **Options sheet** (dropdowns): `https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ5nAvOND5MzZDFFYuheYOtCGQNQkd9J6p-Xgl0jEGyYYAXfCik505qTQ8nkwx8DUx97x300gUBily/pub`
- **Suggestions sheet** (scripts): `https://docs.google.com/spreadsheets/d/e/2PACX-1vTljCCUPSqDBqEvuZsqBT4BqqTVXo7rJRD7NIyp856a8bm4zmLURKnKUA7fQOP4wiRUN0tOhzI7EPHm/pub?gid=1282883121&single=true&output=csv`
- Fetch sheet index → parse tab names → fetch each tab's CSV → parse rows
- Cache in `chrome.storage.session` (survives page refresh, not browser restart)
- Fallback to `src/data/options.json` on network failure

### 10. Manifest Permissions

```json
{
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": ["<all_urls>"]
}
```

## Storage Keys

| Key | Purpose |
|-----|---------|
| `fido_form_state` | Form selections, notes text, keepCampaign flag |
| `fido_prefs` | Theme preference, widget position (right, bottom) |
| `fido_tasks` | Array of reminder task objects |
| `fn_options_v1` | Session cache for Google Sheets dropdown options |
| `fn_suggestions_v1` | Session cache for Google Sheets suggestions |

## UI Design Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--fn-bg` | `#FFFFFF` | `#1E1E2E` |
| `--fn-bg-alt` | `#F0FAFE` | `#2A2A3C` |
| `--fn-bg-panel` | `#A3F8FF` | `#252538` |
| `--fn-text` | `#212726` | `#E0E0E0` |
| `--fn-text-muted` | `#5A6B68` | `#9A9AB0` |
| `--fn-accent` | `#D6086B` | `#FF4D94` |
| `--fn-accent-hover` | `#B5055A` | `#FF6BA8` |
| `--fn-border` | `#D7E1DF` | `#3A3A4C` |
| `--fn-input-bg` | `#FFFFFF` | `#2A2A3C` |

- Font: `-apple-system, "Segoe UI", Roboto, sans-serif`
- Border radius: 12px panels, 8px inputs, 999px toggle/chips
- Transitions: 150ms–200ms ease on all interactive elements
- Mobile responsive: 92vw panel width on screens under 480px
