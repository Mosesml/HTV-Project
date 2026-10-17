# RG Noise Relay shortcut

A signed relay shortcut works only with the app build it was made for: its three
RaveGuard actions name that build's bundle ID and Apple team. Each test phone imports
its own file.

| Phone | App build | Team | File |
| --- | --- | --- | --- |
| Moses | `com.raveguard.moses` | `4RG3WZW8LU` | [RG Noise Relay (moses).shortcut](https://github.com/Mosesml/HTV-Project/raw/refs/heads/main/docs/shortcuts/RG%20Noise%20Relay%20(moses).shortcut) |
| Kean | `com.raveguard.kean` | `G8SD49H5B5` | [RG Noise Relay (kean).shortcut](https://github.com/Mosesml/HTV-Project/raw/refs/heads/main/docs/shortcuts/RG%20Noise%20Relay%20(kean).shortcut) |

Another phone needs its own file: see [Rebuild for another app identifier](#rebuild-for-another-app-identifier).
The team ID is in the provisioning profile Xcode made for that build (free personal
teams expire after 7 days; rebuilding renews it and keeps the same team).

This is an experimental importable relay, **native build
4 or later**. Apple signed the file in **Anyone** mode on October 17, 2026.
Builds 1 and 2 had a registration defect: iOS rejected their static-library action
catalog as `aggregateMetadataIsEmpty`. Build 3 declares the intents in the app
target; all three now appear in the iOS 18.6 simulator's Shortcuts picker and the
imported file preview. Build 3 was also installed and launched on the connected
iPhone running iOS 26.6.2. Physical action execution, actual AirPods switching,
and sustained background operation still require confirmation.

Build 4 also fixes the JavaScript backend allowlist: build 3 displayed
**Background relay** but rejected its `automation` value before calling native
code. Use build 4 to select and test the relay. The corrected shortcut is unchanged.
It also avoids restarting active motion updates on connection callbacks and
filters brief connection fluctuations before showing AirPods dialogs.

The updated file also fixes String variable bindings that imported as empty
fields, and uses **does not have any value** for the absent-runtime guard. Replace
the first shared file with this updated download and select your AirPods again.
AirDrop can carry the signed file; it does not install missing native app actions.

## Import and test

1. Install and launch the matching RaveGuard native build 4 or later on the iPhone.
   A Metro reload or a UI-only branch does not install these native declarations.
2. Download that phone's `RG Noise Relay (<name>).shortcut` (table above) on the phone and open it in Shortcuts. If
   Safari saves it to Downloads, open the downloaded file from Files.
3. During import, select your connected AirPods for both device questions. Both
   **Set Noise Control Mode** actions must point to those AirPods, with fixed
   **Adaptive** and **Noise Cancellation** modes. Check these fields in the editor
   if import does not present the questions. Avoid **Ask Each Time**.
4. Check that **Begin RaveGuard Noise Relay**, **Get RaveGuard Noise Command**,
   and **Confirm RaveGuard Noise Command** resolve in the imported editor. If
   any show an unknown/unavailable action, the app registration issue remains;
   do not treat the relay as working.
5. Start a RaveGuard session; **Background relay** is the production default. Run the
   shortcut once manually to grant any permission requests. A run with no active
   relay controller exits immediately without changing the AirPods mode.
6. Use the session slider at 20, then 90, allowing one relay poll (about two seconds). Verify
   the actual AirPods mode in Control Center and return the slider to Auto.
7. Once manual execution works, create the phone's **App → RaveGuard → Is Opened**
   automation, choose **Run Immediately**, and use **Run Shortcut → RG Noise
   Relay**. Disable Show While Running/notification options if offered. Reopen
   RaveGuard to trigger it and test whether iOS displays any execution UI.

The relay polls every two seconds and requests 1800 repetitions, roughly one hour
plus action time. iOS may terminate it earlier. A missing heartbeat loses app
confirmation after 15 seconds. See [the full test plan](../seamless-noise-control.md).

## Create an iCloud link for other people

After confirming the imported actions work, open **RG Noise Relay** in Shortcuts,
tap **Share → Copy iCloud Link**, and send that link. Recipients need the same app
identifier installed, their own AirPods selected, and the automatic trigger set
up/enabled on their phones. The signed file can also be shared directly.

The download link above is a GitHub file download, not an iCloud shortcut page.
No iCloud share URL has been created: the Mac control tool reports that Computer
Use onboarding is incomplete, so this session cannot operate the sharing UI.

## Rebuild for another app identifier

The generator embeds the native app's bundle and developer team identifiers,
not a particular AirPods device. Regenerate it if those app identifiers change.
`--metadata` checks all three intent names, app-target ownership, parameters, and
background flags against the built app's `Metadata.appintents/extract.actionsdata`.
It rejects the package-only metadata from the broken builds. The generator also
validates String token bindings and existence conditions.

```sh
python3 scripts/build-noise-relay-shortcut.py \
  --bundle-id com.raveguard.YOUR_SUFFIX \
  --team-id YOURTEAMID \
  --metadata /path/to/RaveGuard.app/Metadata.appintents/extract.actionsdata \
  --output '/private/tmp/RG Noise Relay.unsigned.shortcut'

shortcuts sign --mode anyone \
  --input '/private/tmp/RG Noise Relay.unsigned.shortcut' \
  --output 'docs/shortcuts/RG Noise Relay (YOUR_SUFFIX).shortcut'
```

Use `--format xml` to generate the reviewable unsigned plist. The checked-in
unsigned plist and signed binary contain the same workflow. Apple signing may
return a transient HTTP 500; a retry succeeded during preparation.

Local validation covered balanced branches, existing output references, both
device setup questions, installed intent signatures, the wait/Adaptive/ANC/stop
sequence, exact request forwarding, no-runtime exit, and no acknowledgement after
a failed Apple mode action. These checks do not establish successful iOS import
or device execution.

Format references: Apple's bundled `.wflow` examples and installed ActionKit
listening-mode picker; a freely shared single-mode shortcut was used to verify
Apple's route shape and `ActiveNoiseCancellation` value. App Intent descriptor
structure was cross-checked against [a published original workflow](https://gist.github.com/extratone/eb2ebad482c7849977ae05271526edc7).
Apple documents [shortcut sharing](https://support.apple.com/en-asia/guide/shortcuts/-apdf01f8c054/ios)
and [command-line signing](https://support.apple.com/en-gb/guide/shortcuts-mac/apd455c82f02/mac).
