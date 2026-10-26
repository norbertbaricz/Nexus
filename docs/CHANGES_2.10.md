# Nexus 2.10

Date: 2026-10-26

This release addresses the latest screenshot report while retaining the existing app, proprietary license and original legacy source. It does not reset any user database.

- Empty chat, reply, gallery and forum copy uses a centered content block. Empty chat history also centers it vertically within the available history area.
- Discovery has one Create server action. Your servers has one Join a server action in its header; duplicate join/create entries have been removed from those views.
- Unsaved changes open a separate confirmation over the current form. Keep editing restores the same form, draft, focus and scroll position.
- The rules reader has a fixed heading, its own readable scrolling region and a section navigator generated from safe Markdown headings. Rules support up to 32,000 characters; the limit is configurable.
- Only the persisted official server ID is eligible for the official badge and first discovery placement. Matching a name, even under the creator account, grants no badge.
- The editable setup bundle prepares Skypixel Framework with the supplied PNG icon and original GIF banner, five categories, all six supported channel types, six custom roles, a rulebook and pinned welcome/rules/update posts. See [COMMUNITY_SETUP.md](COMMUNITY_SETUP.md).
- Owners can permanently delete a server from its menu or General settings after typing its exact name. Ordinary members retain Leave server. Deletion removes channels, messages, files, pins, invitations and live room membership.
- Message reconciliation retains existing attachment nodes while reactions and pin metadata update, including a revealed spoiler on a forum root. Spoilers still reset when navigating to another conversation.
- Compact chat headers keep Search, Pins and Members on the same row. Call controls and the mobile call dock have centered, bounded layouts.
- Closing an incoming call with X, Escape or the backdrop hides it and stops the local ringtone. Only Decline emits a refusal. The caller's departure clears a hidden invitation.
- Message menus keep Pin/Unpin for that message and omit the duplicate Pinned messages browser, which remains beside Search.
- Kick and voice-disconnect actions have no duration field. Temporary mutes require an end time; bans can be temporary or permanent.
- The new Disconnect members from voice permission lets authorized staff remove a member from their current voice room or stage. Existing protected-moderator rules remain enforced.
- Server timeouts block both messages and joining voice/stage. Text, gallery, forum and voice views show the reason and a live days/hours/minutes/seconds countdown. Expiry restores controls without refreshing the whole app every second.
- Ban rejection opens a centered dialog with the reason, remaining duration, end time or Permanent label.
- Settings > Account includes permanent self-deletion, protected by the current password and permanent username. Owned servers must be transferred, or their deletion must be explicitly included. The confirmation explains removal of profile/messages/uploads, DMs for both participants and replies attached to the deleting member's forum posts. All sessions are invalidated.

See [VALIDATION.md](VALIDATION.md) for automated and browser checks and their boundaries. This update does not certify physical iPhone behavior or native remote media delivery across real networks.
