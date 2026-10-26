# Nexus 2.4 changes

## Conversations

Starting a DM from a server member profile selects Messages and its DM sidebar. Returning to Messages restores the last DM in that tab; a first visit begins with No conversation selected. Usernames are permanent and used for account lookup and mentions. Display names remain editable presentation text.

The composer accepts pasted image files, including screenshot clipboard events, and shows attachment thumbnails, upload progress and remove controls before sending. Uploads can be cancelled. The GIF button opens a searchable catalogue of sixteen original animated Nexus cards; it does not open a file chooser or require an external API key. Emoji categories offer more than 700 distinct choices.

Messages are limited to 8,000 characters. The counter warns and disables sending above the limit, and the server independently rejects oversized content. Repeated sender headers are grouped within five minutes, with a new header across hour/day boundaries, author changes and replies. Messages retain their individual reply, reaction, edit and moderation controls.

Incoming messages follow the bottom while the reader is at the latest messages. Manual scrolling pauses following and shows Jump to latest with a new-message count. Resize and image-load handling keep the bottom anchored while media loads. Older history is not pulled away by a new incoming message. Ordinary live rendering retains a bounded set of messages and supports loading earlier history.

Pins have a fixed-height strip above the scrolling conversation. One compact preview and a count open the full pin list, without stacking pinned rows over the chat. A bounded history window can load an old pin even when it lies outside the latest history page. Each conversation supports fifty pins.

The automatic-storage hint has been removed from the composer. Animated typing dots appear when another member types. Message persistence remains unchanged and is described in SECURITY.md.

## Servers and administration

A server's name opens one menu containing overview, rules, invitations, channel/category creation, settings and leave. Duplicate top-right account settings and the All servers shortcut are removed; account settings remain beside the profile at the bottom left. Clicking that profile avatar opens status choices.

Categories are real persisted records. Managers can create, rename, remove, reorder, collapse and expand them. Removing a category retains its channels. Desktop drag-and-drop moves categories/channels and moves channels outside categories; settings arrows and a category selector provide alternatives on touch devices.

Six channel types have distinct behavior:

| Type | Behavior |
| --- | --- |
| Text | General conversation |
| Announcements | Read-only by default; message moderators post |
| Forum | Topics with separate reply histories |
| Media gallery | Every post requires an attachment or GIF |
| Voice | Microphone, camera and shared screen |
| Stage | Hosts speak and share; listeners receive without opening a microphone |

Each channel gear includes name, topic, icon, type within its text/voice family, category and private role access. Text-family settings add read-only, attachments and slowmode. Voice-family settings add media permission and capacity. A channel cannot convert text history into a voice room.

Server settings include welcome text, default message-alert behavior, roles, member assignments, categories, channel order, moderation and administrative activity. Roles appear as colored chips with local vector icons or an uploaded custom image. Only owners can create or assign permissions; delegated managers cannot escalate their own role.

Moderators can kick, ban, unban, temporarily mute and unmute members. Mutes block posting and remove active voice access until their end time. Bans can expire or be permanent and block both invite and public joining. Owners cannot be moderated; only the owner can moderate another moderator. Members can leave; owners transfer ownership first.

Deleting a DM requires an explicit confirmation and permanently removes its messages and attachments for both people. This is not a personal hide action.

## Identity, discovery and presence

Creator identity is stored by immutable account ID. An existing MaxUltimat3 username is bound on the first upgraded start. On a fresh database, that username is reserved and requires the deployment's CREATOR_CLAIM_TOKEN. Renaming a display name never grants or removes the creator badge. Existing deployments may explicitly select CREATOR_USER_ID.

The creator's public Skypixel Framework server receives Official server styling and sorts first in recommendations. A different account using that server name gets no official status. Discovery now includes already-joined public servers with a Joined label and refreshes after listing changes. Private servers remain excluded.

Additional badges identify actual community owners and accounts created among the installation's first hundred accounts after this feature is installed. They do not claim external identity verification.

Presence indicators are larger. DND suppresses every synthesized cue, including test and local control cues. Original sound notes use lower gain, lower pitches and longer attack/release envelopes. Mentions use a distinct cue. Automatic Away applies to normally-online accounts when all connected tabs are blurred/hidden or inactive for five minutes. Manual DND, Away and Invisible remain authoritative.

## Uploads, media and reliability

All file purposes accept up to 5 GiB (5,368,709,120 bytes), displayed as 5.0 GB. The client uploads in 4 MiB chunks to private disk storage instead of buffering a complete file in RAM. Server-owned upload sessions validate ownership, offsets, lengths and purposes; partial uploads expire after twenty-four hours. A lost chunk response resumes from the acknowledged server offset. Completion is idempotent, so a lost response cannot create duplicate files. Failed or cancelled uploads do not become messages. Unreferenced completed uploads are collected after the expiry period.

The file limit is a storage limit. Very large image dimensions or animations remain expensive for browsers to decode, especially on phones; no claim is made that a 5 GiB image renders efficiently on every device. Filesystem capacity, reverse-proxy body limits and hosting bandwidth still apply. Configure a proxy to accept at least the chunk size plus request overhead; the default client does not send a 5 GiB HTTP request.

WebRTC now exchanges explicit camera/screen MID metadata and stream associations, handles later negotiation events, refreshes relay configuration before capture and stops stale device captures. After signaling loss the previous call reconnects with fresh microphone/camera tracks; screen capture must be started again through a user gesture. Socket.IO retries with backoff and reloads authoritative history on reconnect.

TURN remains required when the peers cannot establish a direct path. TURN_SHARED_SECRET can issue expiring coturn-compatible credentials without exposing the server secret. RTC_RELAY_ONLY is a deployment diagnostic option. A real relay and physical cross-network device testing are still required; see VOICE_DEPLOYMENT.md and VALIDATION.md.

## Interface and packaging

Settings keep their dialog mounted across tabs, preserve drafts and protect unsaved changes when closing. Clicking the backdrop does not close settings. The close guard offers Save changes, Keep editing and Discard changes. Profile previews remain visible on phones. Images fade in, existing avatars occupy the entire avatar area and the personal color/link editors are removed. Menus, controls, presence marks and pin icons have consistent dimensions. Toasts appear near the top instead of covering Send.

The ZIP retains the original Nexus directory, proprietary license, legacy records, lockfile and startup files. Current user databases, private environment settings, dependencies, QA fixtures and test-only browser pages are excluded. See README.md for upgrade steps.
