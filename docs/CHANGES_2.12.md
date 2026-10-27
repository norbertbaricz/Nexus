# Nexus 2.12

Date: 2026-10-27

- Member sidebar rows show the display name without repeating server roles beneath it. Role-based groups and full profile role sections are retained.
- Message text uses 1.65 line height and a 6-pixel gap after the author row. Continuation grouping keeps its existing equal internal spacing.
- Search public servers sits beside Create server. It searches names and descriptions across every opted-in public server on this service, with additional result pages. Quick search retains its existing joined-channel/people scope. Hidden servers and servers banning the viewer stay excluded.
- Early member awards use a fixed 90-day launch window instead of a first-100-accounts count. The first existing account anchors upgrades; a new service starts the window with its first account. The deadline is recorded once, survives restarts and account deletions, and does not remove existing awards. Optional hosting settings are documented in BADGES.md.
- Community owner is derived strictly from a current server owner ID. Joining, moderating or retaining an old stored badge row cannot grant it. Ownership transfer and last-server deletion update related sessions immediately. It grants no permissions.
- Badge and named icon-control descriptions use one shared, bounded tooltip layer. Hover delay defaults to 80 ms, keyboard focus shows descriptions immediately, and labels stay inside the viewport.
- Microphone and deafen controls remain in the user bar before calls. Device/account choices persist locally. Captured audio is disabled before signaling or peer negotiation when entering muted/deafened, and the first server participant state reflects that choice. Leaving, changing rooms and reconnecting retain it. Stage restrictions do not overwrite manual preferences.
- DMs expose one voice Call action. Camera can be enabled during the call; the duplicate direct-video action is removed from the header and compact menu.
- DM previews distinguish text, photos, GIFs, video, audio, documents, other files, multiple attachments and spoilers. The persisted snapshot includes attachment metadata. Edited latest messages update their preview; deleting the latest message reloads the preceding preview.
- The ownership lookup reuses prepared statements and an additive owner index. No dependency or schema-version change is required; existing accounts, files and history remain intact.

See [VALIDATION.md](VALIDATION.md) for verification and deployment limits.
