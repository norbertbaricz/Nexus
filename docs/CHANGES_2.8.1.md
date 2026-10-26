# Nexus 2.8.1

Date: 2026-10-26

- Profile picture and banner controls each have one labeled group with Upload, Adjust and Remove together. Server icon/banner and forum cover controls use the same layout. Groups sit side by side when space allows and stack on phones, with aligned buttons and disabled actions for missing images.
- Typing uses the full display name, including spaces: **QA Bob is typing…** Multiple writers use plural wording and a bounded list of names. Names are escaped as text.
- Typing has a separate live region. Mobile rules hide keyboard shortcut hints without hiding the writer's name or animation. Updating typing no longer replaces the character counter or restarts the dots on every timer tick.
- A writer's typing indicator clears when their new message arrives; stale typing still expires. Blocking and self-event filtering remain unchanged.
- Short landscape screens limit the expanded message input so the typing label and Send control stay inside the viewport even with a long draft.

No new dependency or database migration is required. The license, original legacy files, six channel types and existing backend capabilities are retained. Back up and preserve `data/` and `.env`, replace code, run `npm ci`, restart, and force-refresh browser assets.
