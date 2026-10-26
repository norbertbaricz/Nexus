# Nexus 2.11

Date: 2026-10-26

- Delete server shares the General settings action row with Cancel and Save changes. Its destructive explanation remains in the confirmation dialog. Compact phones show a named trash control so all three actions fit on one row.
- Sign out and Delete account share one account action row. The deletion dialog retains password/username confirmation, the ownership warning and explicit consent before owned servers can be removed.
- Server and account settings use separate rounded tab buttons. Full-width tab underlines, the repeated server-name subtitle, the profile/sounds subtitle and visible synchronization status copy are removed. Account preference synchronization continues normally.
- Narrow conversation composers use the one-line Message placeholder. The full recipient/channel remains available in the header and accessible input label; actual messages still wrap normally.
- Profile picture/banner and server icon/banner editing starts directly on the corresponding preview surface. The edit control appears on hover or keyboard focus and remains visible on touch layouts. Its menu provides Upload, Adjust position and Remove. Existing upload limits, GIF preservation, crop metadata and save/discard behavior are retained.
- Preview updates reuse the existing DOM instead of replacing image nodes when text fields change.
- Activity entries have readable action names, actor names, target labels and bounded before/after metadata for server/channel settings, roles, permissions and reordering. Category changes and deleted channel/role names retain their labels. Existing entries receive readable action names; missing historical detail is not invented.
- Schema 9 adds audit metadata without resetting accounts, conversations, media or previous audit rows.
- Personal community content is no longer loaded by normal Nexus startup or account registration. The generic application contains an explicit local importer; the personal Skypixel data stays in setup/. Run setup-community.bat once with Nexus stopped, or use the documented npm command.
- The personal bundle has Admin, Moderator, Tester, Contributor and Member roles. Its upgrade transfers Best Tester members to Tester, removes the old role and cleans its explicit private-channel grant without widening other members' access. It updates the old default description/welcome text and removes the old role mention from the prepared rulebook, while retaining custom text and history.

See [COMMUNITY_SETUP.md](COMMUNITY_SETUP.md) for the single local import step and [VALIDATION.md](VALIDATION.md) for verification and limits.
