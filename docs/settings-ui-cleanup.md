# Settings UI cleanup

Branch: `moses/concise-settings`, based on main `7cb6346`.

Settings now has three steps: Contacts, Session settings, PINs. Contacts receive alerts,
location and full details; Mark resolved is off. Version-1–3 settings migrate to these
defaults, and editing/saving also applies them. Contact identities and saved timing
choices from version 3 are preserved. The server still enforces permission fields.

## Interface review

Full review of the changed settings flow and Home using the existing React Native
StyleSheet/token system. No new dependency or styling system.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | SetupContactsScreen, SetupSessionScreen, SetupPinsScreen, PinEntryPanel, HomeScreen | Shorter copy; essential PIN and location-sharing explanations retained |
| Surfaces | theme.ts, Screen, PrimaryButton, RecipientEditor, icon.json | Neutral solid backgrounds, retained input outlines and touch targets; solid icon fill |
| Animations | RecipientList, SettingsTransition, responder reveal, PIN entry | Brief entrance, fade exit and layout transitions; system Reduce Motion; no initial contact cascade |
| Icons | Existing Icon, IconChip and PinCard usage | Retained existing icon library; no new icon animations |
| Performance | Shared transition builders; keyed contact wrappers | Builders created once; UI-thread layout transitions; no per-keystroke effect or added dependency |

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium, addressed | setupSteps, phaseNavigation, route layout, setup screens | Four screens including permission grid | Three screens with updated progress, routing and validation | Fewer decisions in the main path |
| Medium, addressed | defaults, setupRows, setupDraft, settingsStore | Per-contact defaults varied | Shared defaults and migration | Removing the permission screen must not leave hidden old choices |
| Low, addressed | Contacts and Session settings | Repeated helper paragraphs under fields | Clear labels/examples and one short responder disclosure | Reduce reading without hiding location sharing |
| Low, addressed | PIN screens | Long explanations and decorative reassurance | Short safe/duress explanations, one length rule, wrong-attempt warning | Keep the functional distinction easy to scan |
| Low, addressed | HomeScreen | Personalized Tonight greeting, large slogan, repeated start hint | App heading and status card | Remove placeholder wearer text and repeated copy |
| Low, addressed | theme.ts, icon.json, design token docs | Purple-tinted surfaces and automatic icon gradient | Solid charcoal surfaces and flat icon fill | More restrained presentation |
| Medium, addressed | RecipientList, SettingsTransition, responder and PIN screens | Immediate insert/remove/reveal | 160 ms entrance, 120 ms fade, 180 ms layout easing | Preserve context during occasional changes |

Considered but rejected: adding an animation package (Reanimated is installed),
staggering contacts on page load (delays a routine form), changing the font families
(existing type hierarchy remains usable), and removing the duress/location disclosures
(those explain meaningful behavior).

## Verification

App tests cover the full three-step save/edit flow, validation, PIN retention,
contact reorder/add/remove, rapid repeated add/remove, and permission migration.
The palette tests check text contrast and token consistency. TypeScript, lint and
an iOS production bundle export passed. Final full suite: 898 tests in 69 suites passed.

Native animation frames, interruption/reduced-motion behavior on a device, and the
compiled app icon are not visually verified. Computer Use could not start because
onboarding is incomplete; a 10%-speed native motion review remains outstanding.
Jest renders animation wrappers as views, so those tests do not establish motion quality.

Verdict: Approve for code review; the listed device/visual checks remain unverified.
