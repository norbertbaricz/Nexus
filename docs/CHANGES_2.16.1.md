# Nexus 2.16.1 — contained server mute warnings

Date: 2026-10-27

On narrow voice pages, the mute notice could retain its full text width inside a centered flex row, clipping both sides. The phone voice grid also left unused space below the footer. The warning now fits the page and uses its bottom footer area.

- The notice, controls and text column have explicit width constraints and zero minimum flex widths. Headings, durations and reasons wrap, including reasons without spaces.
- A voice/stage footer containing a moderation notice consumes available space above it, keeping the warning at the bottom. Phone footer spacing includes the device safe-area inset.
- Long details scroll inside a bounded text area, which can receive keyboard focus. The maximum detail height is adjustable through the CSS variable near the top of styles.css.
- The shared warning layout also keeps timed-mute details inside text, forum and media views.
- Voice controls update immediately when the workspace's moderation state changes, using the existing stable media-view update. Lifting a mute restores the Join call action; applying one removes it. Neither update starts a call.

Server-side mute permissions, durations, countdowns, reasons and voice/stage admission restrictions remain unchanged. No dependencies or database schema were changed. See [VALIDATION.md](VALIDATION.md) for browser measurements and limits.

## Update

Stop Nexus, copy the complete updated source while preserving `.env` and `data/`, run `npm ci` and `npm start`, then reload the browser page. No account reset or personal community import is needed.
