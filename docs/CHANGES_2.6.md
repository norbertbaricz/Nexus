# Nexus 2.6.0

This release reorganizes channel creation, adds bounded sidebar resizing and visible avatar presence, and gives media, forums, Q&A and resource channels their own interaction patterns. It extends server permissions without resetting existing accounts or conversation history.

## Navigation, layout and profiles

- Create channel is in the server name dropdown with Rules, invitations, settings and Leave server. The Channels sidebar and server settings no longer duplicate that action.
- The Nexus wordmark and icon have no navigation action. Messages and Servers remain the section controls.
- Both panel dividers support mouse/pointer resizing, keyboard arrows, Shift for larger steps, Home/End and double-click reset. Left bounds are 220–420 pixels, right 260–480 pixels; each maximum is also capped at 45% of the viewport. At desktop widths with both panels inline, the conversation retains at least 360 pixels. Smaller screens use an overlay for members; phones use fixed drawers without resize handles.
- Avatar images fill the entire frame without a residual color strip. Green/amber/red/gray presence outlines use distinct continuous, segmented and dashed shapes, with accessible labels.
- Profiles separate Nexus badges from Server roles and name the current server. Existing badge sizes remain 28 pixels, with a divider and consistent spacing.
- Voice hides members by default. Its toggle preference is separate from the text conversation preference. Stage listeners cannot activate the microphone control.
- Decorative navigation and controls do not select text when dragged across. Communication content and editors remain selectable.

## Collections and image viewing

Media has a dedicated gallery with grid/list layouts; Resources organizes files in a list. Add media/Share file opens a publishing dialog with upload progress, previews and an optional caption. Read-only members see a clear notice, without a chat composer or upload action. Message storage, permissions, pins, history pagination, filename search, blocks and deletion still use the existing authorized backend.

Images open inside Nexus. The viewer supports Fit, zoom, previous/next navigation, captions and native video/audio controls. No image link opens another browser window. Image Download is available only in DMs and media galleries, subject to server download permission. Uploaded image download requests are checked again on the server. Other files keep their normal download behavior and server permission checks. Uploaded-file downloads stream normally rather than buffering a potential 5 GiB file in browser memory. Optional provider GIF downloads are bounded to 50 MiB and depend on provider CORS support.

Browser-visible images can still be copied or captured by an authorized recipient. Hiding Download does not supply DRM or prevent screenshots.

## Channel types and covers

There are eight working channel types: Text, Announcements, Forum, Q&A, Media, Resources, Voice and Stage. Forum/Q&A cover images can be uploaded during creation or channel settings. The first attached image supplies a topic thumbnail. Q&A uses separate question threads and allows the author or a topic manager to accept/clear a reply as an answer; accepted replies must belong to that question. Blocked answers are redacted.

Media rejects documents and text-only posts; Resources requires an attachment. A conversion to either collection type rejects incompatible existing history instead of silently hiding it. Covers are checked for ownership, purpose and server before channel creation, and served according to current channel access.

## Enforced permissions

The shared registry defines 24 capabilities across access, messages, topics, voice, invitations, moderation and administration. Basic server defaults and role Allow/Deny/Inherit controls are grouped in settings. Explicit denial wins over grants; the owner retains authority. Microphone, camera and screen permissions are independent. Access/capture revocation removes an affected active voice participant and requires a fresh authorized join.

Role managers cannot edit their own/protected management roles, assign themselves roles, delegate protected powers or grant capabilities they do not hold. Channel/role images use separately authorized upload purposes. Legacy broad moderation/message grants retain compatible implied powers, and old invitation grants receive invitation rotation once during migration. See PERMISSIONS.md for the full resolution rules.

## Performance and upgrade

Sidebar resizing updates CSS through animation frames without remounting chat or media. Permission and block caches are bounded. Realtime message hydration is shared for connected users without block filters; blocked recipients receive personalized filtered payloads. Offline users do not trigger unnecessary live payload hydration. Ordinary messages without mentions skip mention-recipient lookup. Persistence, unread calculations and authorization remain in place.

Keep and back up `data/` and `.env`, replace application code, run `npm ci`, restart and force-refresh browser assets. Schema 6 adds columns and a one-time permission migration. The original Skypixel license, legacy records, startup files and pinned dependencies remain intact. QA fixtures, screenshots, test accounts, local secrets and runtime data are excluded from the ZIP.

The validation record describes the actual automated/browser checks. Live GIPHY requires an operator key. Cross-network voice/video still requires deployment verification with HTTPS and a working TURN relay; this release does not provision one or claim a completed physical-device media test.
