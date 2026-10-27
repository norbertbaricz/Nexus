# Nexus 2.17 — first-contact avatars and @username search

Date: 2026-10-27

A search result could return another person's avatar URL while the file endpoint required an existing DM or shared server. That caused a broken image before first contact. People search also treated the visual @ prefix as part of the stored username.

- Authenticated, unblocked viewers can display a person's currently assigned avatar/banner without creating a DM or joining a shared server. The file check validates the current profile assignment by owner ID.
- Unused and replaced profile uploads are owner-only, including for existing contacts. Anonymous access, profile download actions and unrelated private attachments remain restricted. Blocking in either direction prevents current profile media access and excludes the person from people search.
- New message, quick people search and the people API accept username or @username. Whitespace is trimmed, case-insensitive lookup is retained, and SQL wildcard characters keep their literal escaping. Short-input and result-count limits remain in place.
- If an avatar fails to load, its image is replaced with text initials. The presence ring and user wrapper stay intact. The delegated handler is limited to avatar images and does not replace chat/viewer media.

Usernames remain immutable, and search does not create conversations as a side effect. No dependencies or database schema were changed. See [VALIDATION.md](VALIDATION.md) for actual checks.

## Update

Stop Nexus, copy all updated application source files while preserving `.env` and `data/`, run `npm ci` and `npm start`, then reload the browser page. No database reset or account migration is required.
