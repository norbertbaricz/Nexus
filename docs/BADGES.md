# Nexus account badges

Account badges appear beside the display name in profiles. Server roles remain in a separate profile section and control that server's permissions. Member rows do not repeat their role list below the name.

## Early member

The default earning window is **90 days from the service's first account**. On upgrade, the oldest existing account supplies the start date. Everyone registering before the recorded deadline can earn the badge; there is no account-count cap. At the exact deadline, new awards stop. Existing holders keep their badge permanently.

The launch and end timestamps are recorded once in the existing database. Restarting, upgrading, deleting the oldest account or changing the default day count does not reopen the recorded window. Existing badges from older releases remain awarded. No other existing account is retroactively granted a badge merely by signing in.

Before the first start of this upgrade, the operator may configure:

```dotenv
EARLY_MEMBER_WINDOW_DAYS=90
EARLY_MEMBER_ENDS_AT=
```

An optional exact end such as `2027-01-01T00:00:00Z` overrides the day calculation when the window is first recorded. A timezone is required. A zero-day window disables new awards. These settings initialize the deadline; they do not silently rewrite an existing recorded deadline.

## Community owner

This badge means the account **currently owns at least one Nexus server**. Membership or an administrative role does not qualify. The server checks the real owner ID rather than display names, role labels or stored historical ownership flags.

Creating the first server grants it. Ownership transfer updates both accounts; deleting the final owned server removes it. Owning another server keeps it. The badge grants no administrative authority outside the servers that the account actually owns.

## Project creator

This badge uses the single permanently linked creator account ID. See [CREATOR_SETUP.md](CREATOR_SETUP.md). Display-name edits, joining the official server or creating a similarly named server cannot grant it.

Badge descriptions are available on hover and keyboard focus. Icon buttons use the same tooltip system and accessible names. Tooltip timing and geometry live at the top of public/config.js.
