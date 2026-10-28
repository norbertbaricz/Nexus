# Sign-in and account recovery

## Existing sign-in

The permanent username accepts `maxultimat3`, `@MaxUltimat3` and surrounding copied whitespace. The sign-in input no longer clips a 24-character username after an `@` is added. Registration still uses a permanent 3–24 character username. Display names are visual and cannot sign in. Passwords are case-sensitive: leading/trailing spaces and Unicode bytes are preserved exactly, including existing password hashes.

If a real account still fails after updating and restarting the correct installation, check the browser's response status and the server startup paths. `401` means the account/password did not match; `429` means an attempt limit was reached; a `5xx` or readiness error requires server investigation. Do not paste passwords, session cookies, recovery links/codes or your `.env` into chat or public logs. An empty/different database path can look like missing credentials; do not reset storage to diagnose it. A damaged password hash fails closed rather than accepting plaintext.

## Enroll while you can sign in

1. Open **Settings → Account → Account recovery**.
2. Choose **Add email** and enter an address (Gmail or another provider) and the current Nexus password. When delivery is configured, request verification and click **Verify recovery email** in the message on your own Nexus origin. Opening a link does not consume it; verification expires after 24 hours. Never enter the password to your Gmail/mailbox account into Nexus.
3. Choose **Generate codes**, confirm the current password, and save the eight private codes. They are displayed only once. Use **Download codes** or copy them into private offline/password-manager storage. Never post them in a DM, server or support message.

Codes can reset the password and should be protected like a password. The server stores only their hashes; it cannot display the raw codes later. Generating another set replaces every previous code. They are local to this Nexus installation/account, not recovery codes for an email provider or another website.

Add email is never silently disabled because SMTP is missing. Without email delivery, **Save email** records the address as **Not verified**; it does not send a message or enable mail recovery. After the host configures SMTP and restarts Nexus, choose **Verify email** and request a link using the current password. A pending address cannot recover an account. Changing an address leaves the old verified one active until verification succeeds. The old address receives a change notice when mail delivery is available. An already verified address cannot be assigned to a second Nexus account. Removing an email requires the current password and retains the saved code set.

## Configure SMTP on the host

Edit the private `.env` beside the running `server.js`. Keep it out of the ZIP, source control and the public directory. Do not share its credentials.

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | Your real, stable HTTPS website origin, such as `https://chat.example.com` (no path, query, credentials or fragment) |
| `MAIL_HOST` | SMTP hostname supplied by the email provider |
| `MAIL_PORT` | Usually `587` for STARTTLS, or `465` for implicit TLS |
| `MAIL_SECURE` | `false` for STARTTLS on 587; `true` for implicit TLS on 465 |
| `MAIL_FROM` | Provider-approved sender, such as `Nexus <noreply@example.com>` |
| `MAIL_USER` | SMTP username, when authentication is required |
| `MAIL_PASSWORD` | Provider SMTP/app password; not a Nexus account password |

Both authentication values must be present together or both omitted for a provider-controlled authenticated/IP relay. Normal public deployments should use their provider's documented authentication. SMTP always requires TLS and valid certificates; do not disable certificate checks to make delivery work. HTTP origins are accepted only for local localhost/loopback development.

Restart the same Nexus process after editing `.env`. Startup reports whether email recovery is configured, without printing addresses or secrets. Configured does not prove delivery: verify a test account address through the actual provider, inspect its inbox/spam folder and delivery dashboard, and then perform a controlled recovery on that disposable account. Set up the provider's sender/DNS requirements. The automated suite uses an injected local mail transport; it sends no real email and cannot certify your provider configuration.

A changing tunnel hostname changes the origin in future links. Prefer a stable HTTPS hostname, update `PUBLIC_ORIGIN` when needed, restart, and request a fresh link. Never use a URL supplied through an incoming Host/forwarded header as a trusted recovery origin.

## Recover a password

From Sign in, choose **Forgot password?**. With SMTP configured, enter the permanent username (with or without `@`) or the previously verified address. Nexus always gives the same request response for missing, unverified and eligible accounts. Requests are rate-limited and an account has a one-minute mail cooldown. No email address is revealed by the public form.

The emailed link expires after 20 minutes. It opens the password form without consuming the proof. Choose and confirm a new 10–128 character password. Alternatively, choose **Use a saved recovery code**, enter the permanent username and one saved code, then choose/confirm the new password. Without SMTP, Forgot password opens this code flow directly and explains the delivery limitation. **I cannot access either method** opens help for host-assisted recovery.

A successful reset preserves the account ID and conversations, replaces its salted scrypt password hash, removes all sessions and immediately disconnects realtime sessions. Every outstanding recovery/verification link and every old recovery code is revoked, including unused codes. Pending email changes are cleared. The verified address remains available. No automatic login occurs: sign in with the new password and generate a fresh code set. A password-change notice is queued to the verified address when delivery is available.

Links and codes cannot be replayed. Tokens use cryptographic randomness, expire, are bound to their account/purpose/address and are stored only as hashes. Link secrets are in the URL fragment, removed from the address bar when parsed, and are never stored in local storage. Recovery responses are private/no-store. Keep the original email itself private; anyone holding a valid recovery proof can change the password.

## Accounts already locked out

Accounts from earlier releases contain no automatically verified email or saved codes. A username, display name, shared server, creator badge or newly typed email does not establish ownership. If neither proof is available, the operator hosting this Nexus instance must verify the claimant through an independently established private contact or identity process. A community owner, administrator or moderator role does not grant access to another person's account.

Use prior independently verifiable evidence; do not accept the public profile, a screenshot anyone could copy, or a newly supplied address as sole evidence. Never request the member's existing password or recovery codes. If sufficient ownership evidence does not exist, decline recovery rather than hand the account to an unverified claimant. The tool records the host's explicit attestation; it does not perform human identity verification itself.

## Host-assisted recovery without email or saved codes

Run this only in the private terminal of the operator who controls the installation and database. Do not distribute the tool, private database or generated file to a community moderator or expose the terminal through the website.

1. Independently verify the account owner first.
2. Open the folder used by the running Nexus service. Use **recover-account.bat** on Windows, **bash recover-account.sh** on Linux/macOS, or **npm run recover:account**. The tool reads that installation's private `.env` and prints its database path. It may run while the current Nexus service is active; SQLite serializes the short transaction.
3. Enter the permanent username (with or without `@`) or exact account ID. Check the displayed immutable ID, username and creation date against your verification process. You can look up an ID without issuing a link with `npm run recover:account -- --find @username`.
4. Only after completing ownership verification, type the exact requested phrase, such as `VERIFIED @maxultimat3`. The tool uses `PUBLIC_ORIGIN`; if missing, enter your own trusted HTTPS website origin. Never use a requester-supplied website URL. HTTP is accepted only on local loopback development origins.
5. The tool saves the one-time reset link in a private file under `recovery-links/` beside the configured database (normally `data/recovery-links/`). It prints the file path and expiry, not the secret itself. Open that file locally and deliver its link privately to the verified owner. Do not paste it into public logs, tickets or a server channel. Delete the file after the private handoff.
6. The member opens the link and chooses/confirms a new password in the normal reset form. It expires after 15 minutes and can be used once. No email provider or recovery-code access is required for this host-issued proof.

The database stores only a hash of the token and a fingerprint binding it to the current password hash. The private handoff file necessarily contains the link in plaintext and is a temporary password-equivalent secret. POSIX directories/files are created with modes 0700/0600; on Windows, restrict `data\recovery-links` with NTFS permissions to the host/service account. Never serve or publicly share this directory, including through a reverse proxy or backup share.

Issuing a link does not change a password, cancel current sessions or make public profile changes. A newer host link replaces the older one for that account. To revoke a link before use, run `npm run recover:account -- --revoke ACCOUNT_ID` and confirm the requested phrase. A subsequent password reset or authenticated change to recovery methods invalidates outstanding host proofs.

Successful host-assisted recovery preserves the account ID, messages and servers but revokes all sessions, links and old recovery codes. It also removes the previous recovery email and pending address, so an inaccessible or compromised old mailbox cannot reclaim the account afterward. The member must sign in and enroll a fresh verified address/code set. A security notice is queued to the previous verified address when delivery is configured. This host-only authority is not exposed through an HTTP issuance endpoint and is never granted by a community role.

Do not delete the database or recreate the same username to recover an existing account. Back up private storage, keep host/SMTP credentials private, and secure the independent identity process. This is an additional recovery mechanism, not a guarantee that every anonymous account can be safely identified.
