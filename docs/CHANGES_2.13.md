# Nexus 2.13

Date: 2026-10-27

- Microphone and deafen buttons now provide soft, distinct confirmation when deliberately toggled, including before a call. Feedback unlocks browser audio on the user action and is separate from call-state rendering, so loading saved audio choices does not play a surprise confirmation.
- Deafen suppresses incoming sounds while still allowing its own deliberate confirmation. Do not disturb, disabled Sounds and zero volume silence control feedback. Newer taps cancel obsolete pending confirmations and replace previous control notes. Existing message, mention, incoming-call and join/leave cues remain intact.
- Floating notifications select an initial clear gap and retain that viewport anchor throughout the visible batch. Ordinary chat/settings scroll no longer triggers placement scans. Stack-height changes retain the lower anchor; real viewport/context changes can choose another bounded position. Dense layouts retain their compact fallback width instead of oscillating between widths. Long notice text has a bounded internal scroller.
- Interface colors now offers sixteen dark palettes. New choices: Ruby, Ember, Citrus, Mint, Arctic, Indigo, Plum and Sand. Old palette IDs remain valid, account synchronization accepts all choices and dark surface lightness is preserved.
- Avatar status descriptions use the shared tooltip layer across conversations, member lists and profiles. Standalone profile avatars support keyboard focus. An open tooltip follows live status/label changes, and descriptive title attributes elsewhere also use the same presentation without a duplicate native tooltip.
- Existing accounts, messages, artwork, roles, badge deadlines and personal community data are retained. No dependencies or database schema version were changed.

Verification and practical limits are recorded in [VALIDATION.md](VALIDATION.md).
