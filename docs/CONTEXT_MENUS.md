# Context menus

Right-click a supported item with a mouse, use Shift+F10 or the Context Menu key on a focused item, or press and hold it on a touch screen. Arrow keys move through menu actions; Home/End select the first/last action, Escape closes it, and Tab returns to normal navigation. Scrolling the surrounding surface dismisses a context menu. Long presses cancel when the finger moves so normal vertical scrolling continues.

| Surface | Useful actions |
| --- | --- |
| Joined server | Open, overview, rules, mark unread activity as read, invitations and permitted management; leave or owner deletion |
| Public discovery card | View the public server and copy its name |
| Text/voice/stage channel | Open or join, mark as read, copy name/ID; settings, order and deletion when allowed |
| Category | Expand/collapse, copy name; editing and ordering when allowed |
| DM row | Open, view profile, call, copy username, mark as read, block and deletion |
| Member/avatar/call tile | Profile, message/call, copy username; per-person listening controls during calls and allowed moderation |
| Own sidebar profile | Profile/settings, username copy and presence selection |
| Message or forum post | Reply/open post, copy text/ID, reaction, pin; own editing and permitted deletion |
| Attachment/gallery item | Reveal spoiler, open, permitted download and filename copy, plus message actions |
| Editable profile/server artwork | Upload, adjust and remove the draft image |

A context menu is a shortcut to existing actions, not additional authority. Server permissions and current targets are resolved again on selection; API authorization still enforces ownership, membership, blocks and channel policy. Destructive message, DM, channel and server actions retain confirmation dialogs. A menu for another server/channel acts on that clicked target.

Hidden spoilers do not offer open/download actions. Image download remains limited to DMs and Media channels, and server download permission still applies. User avatars, server icons/banners and forum covers do not gain download actions. Text editors, selected text, ordinary links and native audio/video controls retain their browser menus. Blank application surfaces are not globally intercepted.

Touch behavior is controlled by the existing gesture preference. Responsive browser verification is not physical-device certification; test real touch, keyboard and assistive technology in the deployment environment.
