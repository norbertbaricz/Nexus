# Nexus 2.7.0

Date: 2026-10-26

## Interaction stability

- Keyed updates preserve navigation nodes and avatar images when presence changes. Existing message history does not remount for a status-only update.
- Chat scrolling separates live-follow, manual history and explicit anchors. Pin jumps load bounded history and stay anchored through incoming messages and image resizing. Jump to latest uses interruptible animation and respects reduced motion.
- Pins open from the header button beside Search. New pin revisions show a dot; opening the list acknowledges only loaded visible pins and synchronizes that account's state across sessions.
- Personal and server settings use fixed headers/tabs and one scrollable page. Tabs preserve navigation, per-section scroll and unsaved drafts. Opening a dialog focuses its container rather than an input.
- Responsive headers use equal-size action targets and a More menu on narrow panels, including desktop with two expanded sidebars. Server tabs have padded, equally tall controls.

## Account and messages

- Palette, sound toggle/volume, animations, compact mode, touch gestures and media Grid/List synchronize through authenticated per-account partial patches. Offline edits persist locally and retry. Account switching invalidates old in-flight responses.
- Messages and captions support safe bounded Markdown: bold, italic, underline, strike, headings, lists, quotes, code and HTTP(S) links. Raw HTML stays text.
- Server `@everyone` requires the new Mention everyone role permission and reaches only eligible members of that channel. DM `@here` reaches the other participant. Code/escaped mentions do not ping. Group pings have a dedicated rate limit.
- Image spoilers can be selected before sending. Hidden images do not mount a source; a click reveals them for the current view. Navigation hides them again and viewer navigation skips unrevealed items.

## Visuals and channel behavior

- Notifications reserve layout space, have close buttons and support horizontal touch dismissal. Touch gestures also operate drawers, sheet handles and unzoomed image navigation; all have button alternatives and an account preference switch.
- Account badges sit beside profile display names; server roles remain separately labeled. Presence outlines are thicker and preserve their distinct shapes.
- Server artwork fills the complete icon frame. Message avatars align to the start of long content.
- Q&A uses question rows, answer counts and All questions/Unanswered/Solved filters, retaining compact board covers. Resources uses document rows with file-type icons, filenames and metadata. Existing channel types/content are preserved.

## Data and security

Schema 7 adds account preferences, message pin revisions and account pin receipts without replacing existing records. Existing pins start with revision zero to avoid false new-pin notifications. The role registry now has 25 enforced capabilities. Server responses add same-origin resource and form-action protection.

The web client and media delivered to a recipient remain inspectable in that recipient's browser. Private routes/files are protected on the server; this release does not claim DevTools prevention or end-to-end encrypted storage.

## Validation and upgrade

79 automated tests pass. Syntax checks cover 24 server/test scripts and 20 browser modules. See VALIDATION.md for the actual browser checks, including six viewport sizes, and FEATURE_STATUS.md for the request mapping and remaining deployment dependencies.

Back up the whole `data/` directory and private `.env`, stop the service, replace application code, preserve those files, run `npm ci`, restart and force-refresh browser assets. Do not overwrite a live database with an empty one. Original `legacy/` records and proprietary license remain unchanged. No QA fixture, real environment values, installed dependencies or runtime database are packaged.
