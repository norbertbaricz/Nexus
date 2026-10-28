# Nexus 2.23 validation

## Automated verification

The complete suite passes 243 tests on Node 26.12.1. Syntax checks cover 50 server/test scripts and 36 browser modules. All production dependency pins and locked dependency entries are unchanged from 2.22.0. The 36 focused authentication/recovery, mail and migration cases also pass on Node 24.22.1.

New cases cover private unverified email saving without SMTP; inability to recover through an unverified address; host issuance preconditions and unsafe output paths; restricted private files and hashed proofs; unchanged accounts before redemption; expired, rotated, revoked, password-stale and replayed host proofs; concurrent single consumption; clearing old recovery bindings; rollback after a handoff-file write failure; and the absence of a website issuance endpoint. A verified email or authenticated recovery-method change invalidates an outstanding host link. Schema-ten account-security records, token/code hashes and password hashes survive the additive schema-11 migration.

Context cases cover owner/member/discovery permission differences; clicked channel/DM/category targets; category order/collapse behavior; spoilers and existing download restrictions; forum/self/artwork actions; native editor/link/media boundaries; and touch-hold cancellation/click suppression. Existing voice, audio, device, message, upload, moderation, preference, presence, block, community and startup regressions remain included.

All identities, passwords, email addresses, reset links and private files used for verification are disposable fixtures. SMTP tests use an injected local transport and send no real email.

## Actual browser checks

Chromium opens a DM context menu while no conversation is selected. Selecting Open conversation navigates to the clicked DM. Right-clicking the secondary server and choosing Server settings opens its actual saved name; a different channel's settings likewise show that channel's name. A forum post exposes its menu and successfully opens the emoji reaction picker. A Media attachment exposes permitted Open/Download actions, and Open uses the existing in-app viewer. Right-clicking the actual editable avatar surface opens Upload/Adjust/Remove; Adjust opens the image-position editor.

Arrow keys move between menu actions; End reaches the final action; Escape restores focus to the original item. Measured action rows are 44 pixels high with 20-pixel icons and identical label origins. At a 390 × 844 CSS viewport the menu remains within the frame, with no horizontal overflow. Account recovery retains an enabled Add email button without SMTP, opens Save email, and has fields/actions within the viewport without automatically focusing an input. The I cannot access either method path opens recovery help with no password fields and no horizontal overflow.

Browser QA inspects credential forms without entering passwords, creating credentials or submitting recovery changes through browser automation. API fixtures cover actual save, verification, reset and sign-in behavior. Touch holds are verified through controlled pointer/timer cases; no physical iOS/Android device, touch hardware or external VPS was tested.

## Archive and operation

The ZIP checks current fingerprints, reachable browser imports, relative documentation links, unchanged dependency pins, ZIP integrity, the original proprietary license and every original community setup asset/rule/post. Private configuration/storage, generated recovery handoff files, installed dependencies, QA fixtures, native trials and standalone updaters are excluded.

A fresh extracted installation passes npm ci and starts through its normal launcher on Node 26.12.1. A manual overlay onto an extracted 2.22 installation preserves its private environment, existing salted password hash, account/message/upload records and enrolled recovery metadata; the updated launcher serves 2.23 assets and reports database readiness at schema 11. Existing @username sign-in and legacy recovery codes remain usable. The packaged host utility is exercised in a private interactive test terminal; its secret is written only to the restricted fixture file and is not included in the deliverable.

The host-assisted flow depends on independently verifying ownership. The tool records operator attestation; it cannot establish a human's identity itself. Private plaintext link files require careful handoff, deletion and platform-appropriate host permissions. Windows batch execution and real SMTP provider delivery remain deployment checks. No guarantee of universal account recovery or independent security certification is made.
