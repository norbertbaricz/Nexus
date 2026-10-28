# Mobile interaction and keyboard behavior

## Entry and returning to Nexus

The document declares a dark color scheme and opaque HTML/body canvas before requesting external styles. One full-screen cover stays in place through first hydration, bounded font/essential-image readiness and two committed layout frames, then fades out. Asset or font delays cannot keep it covered indefinitely after the interface has initialized. Loading messages and authenticating still require the backend. A restored tab does not create another cover or reload merely because it becomes visible.

Navigation and permission updates reconcile an existing view instead of replacing its entire DOM. Selecting the already open text/DM conversation closes its drawer without clearing/reloading the chat. Avatar and home-view opacity entrance effects are removed. Animated-media source changes are decoded through a bounded queue before replacing the current image, with stale requests ignored after interaction reversal, removal or account change. Existing reduced-motion/GIF playback preferences remain available.

## Keyboard ownership

The viewport metadata requests `interactive-widget=resizes-content` in engines that implement it. The body and application canvas are fixed and opaque; the body is not an additional scroll surface. `public/viewport.js` is the single geometry owner and supports visual-viewport engines too. It clamps to the smaller valid layout/visual height when keyboard events arrive in different frames. Focus loss alone never restores a full-height workspace while the keyboard is still present. Invalid reads retain the last valid geometry, and pinch zoom remains available. If Safari scrolls the root document to a focused input, the controller resets only that root displacement without blurring the input or moving message/settings scroll panels. Root repair is disabled during pinch zoom. Focus, resize, root scroll and visual-viewport events still share one animation frame.

Pressing Send while editing prevents the button from taking input focus. Submission remains a normal button/form action. The async response clears the existing input without forcing keyboard focus back onto a phone. Choosing another input or leaving the view while sending does not have its focus stolen by the response. The same focus protection covers +, attachment-menu choices, removing previews, spoiler toggles and cancelling replies while the editor remains active. A completed upload never refocuses the editor, including after switching to another input or conversation. GIF and emoji opener/result/category buttons also retain the active composer or search input. Touch opening does not automatically focus a picker search or a non-text tab. Selecting or explicitly closing a searched picker hands focus directly back to the existing composer with preventScroll. Both pickers use the visible-height budget and 16-pixel search fields. The keyboard's own dismissal action still works.

Workspace, dialogs, login, artwork and drawers share visible geometry. The composer retains four aligned 40 × 40-pixel controls and a shared final-line baseline for multiline input. Phone DM headers reserve a 12-pixel gap from the avatar's layout box to its name. The GIF action uses the same control geometry without a permanent border; deliberate keyboard focus remains visible.

Multiline editors and compact horizontal tab/thumbnail rows hide scrollbar chrome while retaining native wheel, touch and keyboard scrolling. Message history, channel/member lists, long rules and settings content retain their scrollbars. Toasts use the same visible viewport and fixed footer anchors; scrolling message rows or dialog contents does not choose a new position. Multiple notices grow upward within a bounded scrollable stack.

While browsing away from a connected call, the mobile green return card occupies its own row below the composer. An available screenshare/camera adds one muted live thumbnail; short screens compact it and bound the editor height. The footer accounts for its own safe-area inset. Side drawers use the remaining height. Returning to the active call or disconnecting removes the row.

## Attachments

The + action opens a Nexus menu before asking the OS for a file. Gallery requests image/video selection without `capture`; Audio filters audio files; Files accepts documents and other types. Touch devices also offer Take a photo and Record a video. Only those two actions set the camera-capture hint. Switching back to Gallery/Files clears that hint and restores multiple selection. Camera access is never requested simply by opening the menu.

Opening a protected system picker can temporarily hide the keyboard. Nexus does not force it to reopen after selection, cancellation or upload completion.

The final picker presentation and camera support belong to the browser/OS. A website cannot force a specific installed gallery app, bypass denied permission or replace protected system picker UI. Upload limits, attachment previews, authorization and resumable transfer stay unchanged.

## Touch gestures

Settings → Preferences → Touch gestures controls reply/options swipes, long-press menus, drawer edges, dismissing notifications, sheet handles and viewer navigation. Vertical scrolling and pinch zoom remain native. The gesture surface declares horizontal ownership before movement, so the browser does not cancel the app's horizontal sequence. Older touch-event engines share the same recognition logic when Pointer Events is absent.

Right swipe on message text replies; left swipe opens message options. Hold opens the current target's context menu. Movement cancels a pending hold. Swiping a drawer closed works over channel/member buttons as well as empty areas; the resulting click is suppressed. Multitouch, cancellation and vertical scrolling do not trigger an accidental reply. Viewer navigation is available at fit zoom with multiple items. OS-reserved edge navigation may take precedence.

## Installed websites and verification limits

Apply the complete archive to the active installation and restart Node, then reload the page. Existing installed shortcuts may retain old browser manifest/window metadata. The manifest retains the official Nexus icons and dark background. No account or database reset is required. Background Web Push remains available as described in [notification setup](PUSH_NOTIFICATIONS.md).

Automated tests cover viewport event order, focus retention, picker hints, swipes, holds, cancellation, touch fallback, image decode races and bounded startup. Chromium QA checks real DM send focus, attachment menu rendering, header spacing and small/short/desktop layouts. An iframe resize is a layout test, not a native keyboard emulator. Physical Android/iOS/installed Edge compositor transitions remain device-specific checks; a website cannot certify or recolor every native keyboard/OS animation surface from desktop QA.

Primary references: [Chrome viewport behavior](https://developer.chrome.com/blog/viewport-resize-behavior/) and [Pointer Events touch action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
