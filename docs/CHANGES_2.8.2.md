# Nexus 2.8.2

Date: 2026-10-26

- Consecutive messages have equal spacing inside a group, including the gap after the first message. Text and standalone emoji share the same content column. Standalone emoji no longer add an inline baseline gap. Author/time/reply boundaries and deliberate Markdown paragraph breaks are retained.
- The DM sidebar's View profile action has a 20-pixel gap after the Here since date.
- Servers shows a visible unread indicator from any accessible joined server. The joined-server list shows each server's total unread count, capped visually at 99+; its accessible label and tooltip keep the real count. Channel unread badges identify the room. An official-server icon no longer suppresses the unread marker.
- The browser title totals DM and server unread activity. DM and server navigation indicators remain independent. Counts update for background conversations and for the active conversation while reading older history or using another tab. Returning to live history clears the active channel through the existing read-receipt route; other channels remain unread.
- Existing authenticated bootstrap/read receipts retain counts across reconnects and synchronize a read to other signed-in sessions. Own messages and blocked content retain their existing exclusions. This release does not change desktop-notification permissions or the sound policy.

Spacing values are at the top of public/styles.css; the visual count cap is in public/config.js. No dependency or database migration is required. The original license and legacy files are preserved. Back up and retain `data/` and `.env` when replacing code, run `npm ci`, restart, and force-refresh browser assets.
