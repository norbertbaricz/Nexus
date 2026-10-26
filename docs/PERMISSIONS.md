# Server permission model

The 26-capability authoritative registry is `server/permissions.js`. `/api/config` supplies the same definitions to the grouped settings editor. Client controls reflect current capabilities; routes and Socket.IO handlers enforce them independently.

## Resolution

1. Start with the eleven basic member permissions. A server can override these defaults in Permissions; administrative powers cannot be granted as member defaults.
2. Add Allow grants from assigned roles.
3. Apply explicit role Deny entries before expanding broad capabilities.
4. Expand non-denied broad grants: Manage messages includes Pin messages and Manage topics; Manage all member moderation includes Kick, Ban and Timeout; Manage server includes View activity.
5. Apply explicit Deny entries again. Deny wins over inherited, explicit and implied grants.
6. The server owner always retains all capabilities. Private-channel allow lists, channel-specific settings, blocks, server timeouts and stage audience restrictions still apply as defined by their handlers.

Use server default means that a role supplies neither Allow nor Deny for that capability. Roles have a saved display order for member groups; that order does not change permission resolution or create a numeric hierarchy. A Deny from any assigned role wins. The UI stores basic member defaults as booleans and role overrides as separate allow/deny arrays.

| Key | Label | Group | Initial member default |
| --- | --- | --- | --- |
| `viewChannels` | View channels | Access | Allow |
| `sendMessages` | Send messages | Messages | Allow |
| `attachFiles` | Attach files and GIFs | Messages | Allow |
| `downloadFiles` | Download files | Messages | Allow |
| `addReactions` | Add reactions | Messages | Allow |
| `mentionEveryone` | Mention everyone | Messages | Deny |
| `pinMessages` | Pin messages | Messages | Deny |
| `manageMessages` | Manage messages | Messages | Deny |
| `createTopics` | Create forum posts | Forum | Allow |
| `replyToTopics` | Reply to forum posts | Forum | Allow |
| `manageTopics` | Manage forum posts | Forum | Deny |
| `connectVoice` | Connect to voice | Voice | Allow |
| `speak` | Use microphone | Voice | Allow |
| `useVideo` | Use camera | Voice | Allow |
| `shareScreen` | Share screen | Voice | Allow |
| `inviteMembers` | Invite members | Community | Deny |
| `manageInvites` | Replace invitations | Community | Deny |
| `kickMembers` | Kick members | Moderation | Deny |
| `banMembers` | Ban members | Moderation | Deny |
| `timeoutMembers` | Temporarily mute members | Moderation | Deny |
| `moderateMembers` | Manage all member moderation | Moderation | Deny |
| `manageChannels` | Manage channels and categories | Administration | Deny |
| `manageRoles` | Manage roles | Administration | Deny |
| `viewAuditLog` | View activity log | Administration | Deny |
| `manageServer` | Manage server settings | Administration | Deny |

## Delegation and compatibility

Only the owner can delegate protected management powers: Manage server, Manage roles, Manage channels, Manage all member moderation, Kick, Ban and Timeout. A non-owner role manager cannot edit/delete a protected role, edit a role they hold, assign roles to themselves or change the owner's assignments. They cannot grant a permission they do not hold. Assignment changes check every added or removed role. Role icons use a separate role upload purpose, so managing harmless roles does not require managing channel/server artwork.

Broad capabilities from older releases retain compatible implied behavior, subject to explicit denial. The schema-6 migration adds Manage invites to existing Invite members roles once, preserving their previous ability to rotate invites. A marker prevents a restart from restoring a permission the owner later removed. Version-five migration tests preserve messages, existing role grants and invitation codes, and verify that later invitation denials survive another restart.

## Enforcement

Posting requires Send messages. Forum roots additionally require Create topics, and replies require Reply to topics. Collections require an appropriate attachment. File/GIF posting requires Attach files and the channel attachment setting. Read-only/slowmode bypass needs Manage messages; an explicit Send denial still prevents posting. Pin messages and Add reactions are checked independently. Mention everyone is a separate non-basic role grant. A server `@everyone` ping reaches only members authorized to view that channel and excludes blocked contacts; group pings have a separate rate limit. It never exposes a private channel to other members. DM `@here` reaches only that conversation’s eligible participant.

Download files applies to explicit server file downloads and generic binary file access. Inline media needed to display/play a permitted message remains readable, so this permission is not DRM. The stricter image policy additionally limits the application's image Download action to DMs and Media channels. See SECURITY.md.

Voice connection, microphone, camera and screen sharing are checked separately. A denied microphone does not implicitly deny permitted screen sharing in an ordinary voice room. Stage audiences cannot publish capture regardless of general member defaults. Revoking required room/capture access removes an affected active participant and stops their capture; they must rejoin with valid rights.

Invite members controls reading/sharing the current invitation; Manage invites controls replacing it. Channel/category changes use Manage channels. Server details/basic defaults use Manage server. Activity uses View activity. Moderation checks the specific Kick/Ban/Timeout capability; non-owners cannot moderate protected managers or the owner.

Permission changes invalidate a bounded server/user cache, refresh bootstrap capabilities and socket room access, and disconnect affected voice access. Blocks have a separate bounded cache invalidated on change. Neither cache replaces route-level authentication.

## Extending the model

Add a capability to the registry with an explicit default, wire it into the relevant server route/socket event, expose an appropriate grouped control and verify permission denial plus live revocation. Existing JSON grants remain compatible with additive capabilities because unknown keys are ignored. Per-channel action overrides, an authority hierarchy and member-specific permission explanations remain future work; do not infer them from the current private-channel allow list.

## Member display order

A role's Display separately flag controls an online member-list group. An online member appears only under their first enabled assigned role in saved order. Other online members use Online; every offline/invisible member uses Offline. A special owner display entry follows the current owner automatically. Only the owner can reorder entries or change the owner display switch; ordinary role display flags follow existing role-edit authorization. Order/display changes never grant capabilities, alter private-channel access or transfer ownership.

## Voice disconnection and account lifecycle

`disconnectMembers` is an administrative moderation permission, included by `moderateMembers`. It removes the target from their current room or stage; it does not ban them from rejoining. Only the owner may moderate another protected moderator. A server timeout is separate and blocks messages plus joining any server voice/stage room until expiry.

Permanent server deletion requires ownership and the exact server name; a management role alone cannot delete it. Account deletion applies only to the authenticated account, requires its current password and username, and requires explicit consent to delete owned servers if ownership has not been transferred.
