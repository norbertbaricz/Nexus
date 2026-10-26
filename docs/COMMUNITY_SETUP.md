# Your personal Skypixel Framework server

Nexus is a generic communication application. Its normal startup and registration do not read the personal community files or create a Skypixel server. The files in setup/ are your separate, editable community data; no application view, API registration flow or default server template embeds their names or channels.

## Apply the prepared server once

Use the Nexus installation containing your real `.env` and `data/` directory:

1. Identify your existing creator account using [CREATOR_SETUP.md](CREATOR_SETUP.md).
2. Stop Nexus.
3. On Windows, open **setup-community.bat** from the Nexus folder. Alternatively run:

```sh
npm run setup:community -- setup/community.json
```

4. Start Nexus normally and sign in. Your account owns the prepared server and is already a member. Discovery is enabled, and its persisted ID identifies the single official server.

Creating a download does not modify another running installation's private database. The import must run where that database and its uploaded files live. No account, password or private database is shipped in the ZIP.

## Prepared organization

| Category | Channels |
| --- | --- |
| START HERE | welcome, rules, updates — announcement feeds with pinned starting posts |
| COMMUNITY | general, introductions — text; showcase — images, video, audio and files |
| BUILD & TEST | support, bug-reports, ideas — forums; testing-chat — text |
| LIVE ROOMS | The lounge, Co-working — voice; Community stage — stage |
| TEAM | staff-chat — text; Staff room — voice; both private to Admin/Moderator and the owner |

The five custom roles are **Admin**, **Moderator**, **Tester**, **Contributor** and **Member**. The built-in Server owner role is separate. Recognition roles grant no administrative powers. Assign roles to real people in Server settings > Members.

The original supplied PNG and GIF remain in setup/assets/. The GIF contains one frame, so this particular banner is static; multi-frame GIFs are still supported by Nexus.

## Updating your earlier prepared server

The explicit importer uses the stored community ID. If this is its first import, it adopts the earliest creator-owned server with the same name or creates one. Existing channels and history stay in place; the data bundle controls initial description, rules and artwork application.

The 2.11 bundle is revision 2. For an earlier import it transfers Best Tester assignments to Tester and removes Best Tester. Its old explicit private-channel role grants are removed instead of granting access to every Tester. The importer replaces the old supplied description/welcome wording and the old role mention in the supplied rulebook, while retaining other custom text, images, channels and history. The member/role migration and revision marker commit together.

Running the same revision again keeps live edits. A deliberately deleted imported server stays deleted. A different server with the same name never inherits official status. A full database reset removes the imported server and its accounts; identify the creator and run the explicit import again if you want to recreate the personal community.

## Data files and reusable importer

- setup/community.json — the personal server definition, roles, ordering and one-time revision changes.
- setup/rules.md and setup/posts/ — the Markdown rulebook and starting posts.
- setup/assets/ — the supplied original image bytes.
- scripts/setup-community.js and server/community-template.js — the generic importer, which can also accept another trusted local manifest.

Later everyday edits belong in the normal server settings. Personal import data is not reapplied by restarting Nexus, registering an account or creating an ordinary server.
