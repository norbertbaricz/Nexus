# Background system notifications

Nexus uses the standard Push API, Notifications API and a root-scoped service worker. The host sends encrypted Web Push to the browser provider, which can wake the worker without an open Nexus page. A shortcut or installed-site window alone does not provide this transport.

## Host setup

1. Copy the entire 2.32 release over the stopped installation, retaining `.env`, the database and uploads. Restart the same Node service and reload receiving clients so the current worker activates.
2. Set `PUBLIC_ORIGIN=https://your-real-host.example` in the private `.env`. Use only the origin, without a path, query or fragment. Keep `PUSH_ENABLED=true` or leave it unset.
3. Use your normal working HTTPS reverse proxy/tunnel. Keep `/service-worker.js` public, on the root origin, with its supplied `no-store` and JavaScript headers. Do not redirect it to an asset build or HTML. Forward `/api/push/*` to Node like other APIs; do not cache authenticated API responses.
4. Permit outbound HTTPS to the relevant browser push service. Nexus accepts Chrome-compatible FCM, Mozilla, Apple Web Push and Windows notification endpoint hosts. An unsupported provider fails closed. No incoming push-specific port is required.
5. Open Nexus at that exact HTTPS origin, sign in and enable Settings → Preferences → Notifications on each device. Activation automatically requests one confirmation notification while Do not disturb is off. Then test a real unread DM from another account with the receiving installation closed or locked.

The VAPID signing identity is generated once in the private `app_settings` database record and persists across restarts. Back up the database securely; copying only application files does not change that identity. The public application key is safe to send to signed-in browsers. Never publish the private database or signing key. `PUSH_SUBJECT` is optional: a `mailto:` operator contact or HTTPS origin, defaulting to `PUBLIC_ORIGIN`.

For ngrok, an address change creates a different website origin. Update `PUBLIC_ORIGIN`, restart, open the new address and enable notifications there. Old installed shortcuts/subscriptions do not move to a new origin automatically. A stable HTTPS domain avoids repeated enrollment. Startup remains usable without push configuration; settings then explains why only live notifications are available.

## Devices and permission

| Device | Requirements |
| --- | --- |
| iPhone / iPad | Web Push-capable iOS/iPadOS, starting with 16.4; Nexus added to Home Screen; open that copy and enable notifications through the explicit user action |
| Android | Browser exposing PushManager, service workers and notifications over HTTPS; notification permission; compatible system/background settings |
| Windows / macOS / Linux | Compatible browser with notification permission; installation is optional where the browser supports push for regular websites; browser/OS background policy still applies |

Permission is requested only after the member enables the setting. Nexus cannot force access, bypass a denial or override Focus/battery policies. If denied, allow notifications in the browser/system settings first. A device-local preference avoids enabling other devices silently. Supported installed apps can receive app-icon badging; the OS decides whether/how to display it.

The VPS must be running and able to read its database to accept new messages and dispatch jobs. Its durable outbox retries transient provider failures with bounded delays and expires jobs after five minutes. The browser provider may retain accepted pushes for the remaining lifetime. This does not promise delivery during an outage, after force-stop, with a fully terminated background browser, or when notifications are suppressed by the OS.

## Live delivery and reading

A visible but unfocused browser window does not mark new messages read. History, voice screens, other conversations and blocking dialogs also do not count as reading the active conversation. Live realtime messages carry their current all/mentions policy, so a first DM can alert before the sidebar refresh completes. When background enrollment is unavailable but a persistent notification worker is ready, mobile live alerts retain a private account binding; they do not rely on the desktop-only Notification constructor. This fallback requires Nexus to remain open and connected and does not replace background Web Push.

## Delivery and privacy

- Direct messages, mentions and server alerts follow current server notification defaults. Server mentions are resolved by the existing message/permission logic.
- Online, Idle and Offline do not disable delivery. Do not disturb suppresses message alerts and activation confirmations; OS notification policies still apply independently.
- Sender/recipient blocks, current private-channel access, server membership, DND and conversation read state are rechecked immediately before transport. The sender is excluded. Keeping Nexus focused on another conversation, voice room, server page or dialog does not suppress the entire device. Reading the actual conversation can cancel its queued alert during the grace period. Activation confirmation bypasses read state and still obeys DND.
- Alerts retain the official Nexus icon. DMs identify the sender by display name and permanent username, with a bounded message excerpt and attachment labels. Server alerts identify the server and channel, with sender and excerpt in the body. Both live and background paths use the same server-generated details. Markdown is simplified, text spoilers are replaced and spoiler attachment names are hidden. Legacy queued pushes without details retain a generic fallback.
- The sender encrypts the payload and authenticates to the provider using the pinned `web-push` package. This protects push transport; it is not end-to-end encryption of Nexus chat storage. The VPS still operates the application's data.
- Subscriptions are private, authenticated and session-bound. Logout, account deletion and password recovery revoke the corresponding delivery authority. Changing accounts replaces the worker binding; late pushes from the previous binding are ignored. Disabling notifications clears that device's worker binding and subscription.
- Delivery is coalesced per device/conversation and queued with limits. Repeated activity can replace an earlier pending alert; this is an activity notification service, not an exact-message delivery receipt. Already submitted provider requests may still produce an in-flight alert after a block/read/DND change. The receiving device's lock-screen preview settings determine whether its OS hides message details.

Clicking a notification focuses an existing Nexus window or opens the same origin, then selects an accessible conversation. It never automatically joins voice or starts the microphone. Private content still requires the signed-in account and normal API authorization. The worker does not intercept fetches or cache the application, messages or uploads; it retains only the minimal device binding in IndexedDB.

## Troubleshooting

Settings shows whether the device is connected, needs HTTPS, is blocked by permission or lacks browser support. Enabling Notifications requests one automatic confirmation through the configured push transport, or a live notification where only that mode is available. Ordinary tab restoration/reconnection never repeats the confirmation. A successful request means queued/accepted, not guaranteed OS display. DND pauses both message alerts and confirmation. Inspect the system notification center and test a real unread message from a separate test account. Provider failures are logged as bounded HTTP/network classifications without subscription endpoints, credentials or contents.

After permission restoration, reconnect from settings. Opening or returning to Nexus refreshes the subscription and repairs expired endpoints or a changed signing identity. A provider's subscription-change event can renew in the background where supported; if the session has expired, sign in and enable again. Do not reset the database to fix a notification problem.

This release adds message notifications, not native incoming-call services, background microphone/camera capture or an offline app cache. Real OS standby delivery must be verified on the intended physical devices.

Primary platform references: [Apple Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) and [Microsoft Edge Push API](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push).
