# Nexus 2.14

Date: 2026-10-27

- Removed the obsolete mobile Discovery grid rule that moved the header actions below its title. The complete header now uses one explicit flex row; the title can truncate on very narrow screens while both action buttons remain available.
- Generic narrow conversation-header container rules exclude Discovery, keeping their row placement from affecting its title/actions.
- Profile names and badge groups share one row. Badge groups have intrinsic width and never wrap internally. Badge width, height, minimum width and flex basis use the same configurable size, avoiding mismatched mobile boxes. Shared gaps/sizes are at the top of styles.css.
- Long display names wrap within their remaining space while the badge group stays together. Public profiles, the DM sidebar and Settings preview use the same layout.
- Existing controls, tooltips, account data, settings, server content, media and badge eligibility are retained. No dependencies or database migrations were added.

See [VALIDATION.md](VALIDATION.md) for browser measurements and testing limits.
