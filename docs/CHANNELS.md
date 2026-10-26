# Channel behavior

Create channels from the server name dropdown. Channel gears appear on hover or keyboard focus; touch layouts retain an accessible path through the active channel and Server settings → Channels. Icons are selected visually from a labeled, keyboard-accessible grid.

| Type | Main interaction | Posting rules |
| --- | --- | --- |
| Text | Grouped messages, replies, reactions, pins and attachments | Send permission, read-only rules, slowmode and attachment permission |
| Announcements | Announcement conversation | Read-only by default; owner/authorized moderator posting |
| Forum | Grid/list of posts, optional board cover; each post opens its own chat | Send plus Create forum posts or Reply to forum posts permission |
| Media | Images, video, audio and documents in grid/list | Attachment required; separate publishing dialog |
| Voice | Independent microphone/camera/screen controls | Connection/capture permissions, media switches and capacity |
| Stage | Host presentation with a listening audience | Room checks; audience does not capture or publish |

## Retired channel types

Q&A and Resources are unavailable in creation and conversion controls and are rejected by new channel requests. Schema 8 converts existing Q&A to Forum and Resources to Media once. It preserves channel IDs and names, access rules, message roots/replies, attachments, pins, covers and legacy accepted-answer metadata. It does not merge conversations or delete content. Names remain editable; accepted-answer actions/filters are removed.

## Forums and collections

Forum Grid/List and Media Grid/List are independent account preferences. New post opens a publishing dialog: the first line is the title, followed by optional Markdown and attachments. Clicking the post opens its root and separate replies with the ordinary chat composer. Posting a file without text is allowed when the roles permit attachments. The first image supplies the forum thumbnail; an image spoiler is hidden there until revealed. Long titles are clamped in summaries while their complete content remains in the thread.

Media uses Add media or files and a separate publishing dialog. Documents use file-type icons and metadata alongside visual attachments. Captions are optional and cannot be published alone. Read-only members can view the gallery and see an explicit notice. Empty/short galleries and forum boards never show a chat Jump to latest button.

A channel converted to Media must already contain an attachment on every post; conversion is rejected if it would hide text-only history. Documents no longer prevent conversion. Forum/voice history cannot be converted into each other.

## Images and spoilers

Every attachment can be marked as a spoiler before publishing: images, video, audio and documents. An unrevealed item has a placeholder and no mounted media source or file-download control. Reveals reset when leaving the DM/channel/thread. Viewer navigation skips unrevealed media. Spoilers change presentation, not file authorization or copy protection.

Avatar/banner/server/role/forum-cover uploads open a position editor. Existing artwork has Adjust controls. The composer image thumbnail opens the same editor for its message/gallery/forum preview. Position and zoom metadata are validated and saved without changing the original bytes or GIF animation. Responsive preview frames may use different aspect ratios; downloads/viewer originals remain intact.

Images open in the in-app viewer with Fit, bounded zoom and navigation. Explicit image Download is permitted only in DMs/Media and remains subject to server download permission. Forum/Text/channel artwork does not have an image Download action. Non-image files retain authorized downloads. A permitted browser recipient can still inspect or copy displayed content independently of this application policy.

Pins open beside Search with a new-pin dot and per-account read state. History and pin jumps use bounded authorized windows. Messages/captions/rules/bios/descriptions use safe Markdown; identity labels remain plain text. All types enforce membership, private roles, blocks, limits and relevant file permissions. Voice remains an eight-person mesh; see VOICE_DEPLOYMENT.md.
