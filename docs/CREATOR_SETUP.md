# Linking the project creator account

The creator badge is linked to a permanent account ID in the existing database. Changing a display name, avatar or banner does not transfer it. Server owner is a separate role; the Project creator badge appears on profiles.

## Existing account with username @maxultimat3

1. Keep your existing `data/` directory and `.env` file.
2. Leave `CREATOR_USER_ID` and `CREATOR_CLAIM_TOKEN` empty.
3. Restart Nexus with the updated code and sign in to your existing account.
4. Open Settings > Account. It should show **Project creator · Linked permanently to this account**. Your profile has the Project creator badge.

On the first upgraded start, the existing immutable username is matched once and its ID is saved. This uses the username, not the display name.

## Existing account with another username

1. Sign in to the intended account.
2. Open Settings > Account and select **Copy ID**.
3. Stop your Nexus server. Set `CREATOR_USER_ID` in the private `.env` file to the copied ID. Leave `CREATOR_CLAIM_TOKEN` empty.
4. Restart Nexus and check the creator status in Settings > Account.

An already stored creator binding is retained. This setting does not silently transfer a badge away from a previously linked account. Do not delete the database to change a badge. Investigate an unexpected existing binding before changing ownership data.

## Brand-new installation without an account

1. Generate a private random token locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

2. Set `CREATOR_CLAIM_TOKEN` in your private `.env` to that generated value. Keep `CREATOR_USER_ID` empty.
3. Start Nexus. Choose Create account and enter the permanent username `MaxUltimat3`.
4. The Creator claim token field appears. Enter the same private token there and complete registration with your own password.
5. Check the creator status in Settings > Account. Stop Nexus, clear `CREATOR_CLAIM_TOKEN`, then restart.

Never publish the token, commit `.env`, send it in a chat message or use it as your account password. The token is only for the first registration of the reserved username. It is not needed at normal sign-in and is not sent to other clients.

The private creator binding and all account records live in the running server's configured SQLite database. Restarting another copy with a different `data/` directory operates on another installation.

## Your personal community

Creator identity and personal server creation are separate. After identifying your creator account, stop Nexus and run setup-community.bat once if you want to apply the personal Skypixel files. This also updates an earlier prepared server to the five-role configuration. See [COMMUNITY_SETUP.md](COMMUNITY_SETUP.md). Ordinary startup and registration do not load personal community content. Only the imported server ID is official; matching a name does not grant that badge.
