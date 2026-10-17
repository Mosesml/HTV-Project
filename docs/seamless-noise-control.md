# Seamless noise-control investigation and background relay

October 17, 2026. Read alongside `PRD.md` C16/HRG-4 and `WORK_ORDER.md` M4/BL1.
The request to avoid app switching changes the earlier acceptance of a visible
Shortcuts round trip. The threshold stays Adaptive below 70 / ANC at 70 or above;
the 0–100 value remains a policy score, not an AirPods strength setting.

## Finding

`ShortcutsController.launch` opens a `shortcuts://x-callback-url/run-shortcut` URL
using `UIApplication.open`. Every automatic threshold crossing eventually launches
another app. `x-success` brings RaveGuard back after completion; changing the callback,
increasing dwell, or dropping x-callback does not make the execution silent.

The new **Background relay** backend does not open URLs. An automation that the
wearer creates once runs Apple's noise-control action and pulls commands from
RaveGuard through background App Intents. The Swift meter, dose calculation, and
automatic protection loop remain in RaveGuard; JavaScript is not needed per change.

This is an experimental alternative, **not a verified solution for unattended,
indefinite operation**. Apple documents background intents and automatic App
triggers, but does not promise unlimited execution of a looping Shortcut. The
app's audio background mode does not grant background time to the Shortcuts host.
Real iPhone/AirPods testing, including sustained locked operation, is required.

## What the wearer sees

1. One-time setup in Shortcuts. Production builds select **Background relay** by default;
   Debug can still override it for diagnosis.
2. Open RaveGuard: an App-open automation starts the relay without asking.
3. RaveGuard stays visible as the room changes. The relay checks every two seconds;
   mode changes respect a two-second dwell after the last completed change.
4. The session says **Through background relay** after the Set Noise Control action
   completes and the relay acknowledges it. This is action completion, not an
   independent measurement of hardware state or acoustic attenuation.
5. If the relay stops polling for 15 seconds, the app says **Background relay not
   confirmed**. It does not silently fall back to opening Shortcuts. Dose calculations
   use the existing conservative unconfirmed-output path.

The old **Shortcuts** backend remains available explicitly for comparison. **Off**
remains the initial backend. No Linux bridge or private API is added.

## One-time setup on the demo phone

An importable, Apple-signed **RG Noise Relay** file is now available with the
entire loop and two AirPods device setup questions. See
[download, import, and sharing instructions](shortcuts/README.md). This can avoid
building the actions manually and may bypass the picker discovery problem.
Imported action resolution and physical execution remain unverified; the file
does not establish that the registration issue is fixed. The instructions below
remain the manual construction alternative.

First rebuild the native app; a Metro reload cannot install App Intents.

```sh
cd app
npx expo prebuild --platform ios --no-install
cd ios
pod install --no-repo-update
cd ..
npm run ios:device
```

Launch the rebuilt app once. In Shortcuts, search RaveGuard's actions and confirm
these three are present before proceeding:

- **Begin RaveGuard Noise Relay**
- **Get RaveGuard Noise Command** (Relay input)
- **Confirm RaveGuard Noise Command** (Relay and Request inputs)

The Expo config plugin declares the three `AppIntent` types in the generated app
target and calls the native controller through `RaveGuardNoiseRelay`. The earlier
static-pod package catalog was rejected by iOS; native build 3 fixes this. If the actions are missing from
the picker, try the importable file above and inspect whether its actions resolve.
If they are unavailable there too, setup remains blocked: simulator compilation
alone does not prove device discovery or execution.

Create a Shortcut named **RG Noise Relay** with this sequence. Connect/wear the
AirPods while configuring both **Set Noise Control Mode** actions; select the actual
AirPods device and a fixed mode, never “Ask Each Time.”

```text
Begin RaveGuard Noise Relay
Set Variable "Relay" to its result
Repeat 1800 times
    Get RaveGuard Noise Command (Relay: variable Relay)
    Get Dictionary from Input (the command result is JSON text)
    Set Variable "Command" to that dictionary
    Get Dictionary Value "action" in Command
    Set Variable "Action" to that text

    If Action is "stop"
        Stop This Shortcut
    End If

    If Action is "adaptive"
        Set Noise Control Mode: [your AirPods] → Adaptive
        Get Dictionary Value "request" in Command
        Confirm RaveGuard Noise Command (Relay: Relay, Request: that value)
    End If

    If Action is "noiseCancellation"
        Set Noise Control Mode: [your AirPods] → Noise Cancellation
        Get Dictionary Value "request" in Command
        Confirm RaveGuard Noise Command (Relay: Relay, Request: that value)
    End If

    Wait 2 seconds
End Repeat
```

The repeat count is only a requested upper bound (about one hour plus action time),
not a promise that iOS will keep the Shortcut running that long. Do not enable
continuing after a failed noise-control action: confirmation must only follow
successful action completion. No Open App, Open URL, Show Result, or alert actions
belong in the loop.

Create a personal automation:

1. Trigger: **App → RaveGuard → Is Opened**.
2. Choose **Run Immediately** (on older iOS, disable **Ask Before Running**).
3. Action: **Run Shortcut → RG Noise Relay**.
   Expand that action and disable **Show While Running** if that option is present.
4. Disable **Notify When Run** if the phone offers that option. iOS may still show
   system execution UI; validate the actual phone before calling it invisible.
5. In RaveGuard Debug select **Background relay**, start the session, then leave and
   reopen RaveGuard to trigger the automation. After session Stop, reopen RaveGuard
   again to start a fresh relay for the next session.

Test each underlying noise action manually once to accept device permission prompts.
While the background relay is running, use the session slider to test 20 then 90,
wait through the dwell, and inspect Control Center's AirPods mode. Return to **Auto**
for the mic-driven loop. Do not use the original RG Adaptive/RG Noise Cancellation
URL launchers inside this relay; put the noise actions directly in it.

## Failure handling and limits

- A command needs an exact request acknowledgement. Wrong, stale, superseded, and
  post-Stop acknowledgements are rejected. New automation invocations supersede old
  runners; old loops receive `stop` on their next poll.
- Stop, backend Off, and runtime shutdown invalidate outstanding relay commands.
  An Apple action already executing cannot be recalled.
- AirPods disconnection invalidates confirmation. A later poll must reapply the mode.
- The relay must be started by an actual system trigger or the wearer. App code cannot
  synthesize an App-open trigger without foregrounding an app, and cannot silently
  restart an expired Shortcut itself. This is the main unresolved reliability limit.
- All relay state is in memory. A killed process does not restore the previous session.
  A background intent with no live runtime returns `stop`; it does not create a session.

## Other routes considered

| Route | Assessment |
| --- | --- |
| Remove x-callback / change URL options | Still launches Shortcuts; fails the requirement. |
| Block switching with Guided Access / Single App mode | Restricts leaving the app; does not give the URL runner a background execution channel. Programmatic Single App mode also requires MDM-supervised eligibility. Not a fix. |
| App Intents directly set AirPods mode | App Intents can expose RaveGuard actions; no supported AirPods setter was found in the iOS SDK. The Apple noise action must still run in Shortcuts. |
| `RunSystemShortcutIntent` (iOS 27) | Apple limits it to a user-pressed widget button. Its perform method has no effect in other contexts, so the mic loop cannot use it. |
| Siri, Action button, widget button | Can avoid the full Shortcuts app, but require a user action per run or a relay; cannot trigger every measured crossing by themselves. |
| Private `BluetoothDevice.setListeningMode:` / `AVOutputDevice.setCurrentBluetoothListeningMode:error:` | Reverse-engineered selectors exist. Not proven to control AirPods from this signed, sandboxed iOS app. Modern macOS research shows setters can merely update cached state. A separate real-device spike could test this, but it is not evidence of a working native iOS API and must not be presented as verified. |
| Direct Bluetooth AAP/L2CAP / external bridge | Requires a usable transport. The macOS IOBluetooth experiment is not an iOS implementation; CoreBluetooth is not a general Classic Bluetooth AAP transport. An external bridge changes the work order and hardware setup. |
| Set Adaptive once and let AirPods adapt themselves | Provides automatic, seamless environment response after setup. It gives up RaveGuard's measured/dose-driven threshold escalation to full ANC; useful demo fallback if the relay cannot survive the required duration. |

## Device acceptance before calling this fixed

Record phone/iOS version, AirPods model/firmware, and duration for each run.

- Discover all three actions on the rebuilt physical phone.
- Run the App-open automation; observe whether iOS displays banners or other UI.
- Cross the threshold at least ten times; verify the actual mode in Control Center,
  two-second dwell, no app switches, and continued audio/metering.
- Run for the intended demo duration and at least 30 minutes; lock for five minutes
  and change foreground apps. Measure when/if iOS terminates the relay.
- Stop the Shortcut deliberately; verify confirmation disappears within 15 seconds
  and the app never launches Shortcuts as a fallback.
- Exercise Stop/Off, session restart, AirPods out/back in, duplicate App-open triggers,
  a noise-action failure, and check-in/PIN screens. The safety ladder must keep working.

## Local verification

**Unknown-action cause and fix, October 17:** Both builds 1 and 2 reproduced
`LinkMetadata.BundleMetadataExtractionError.aggregateMetadataIsEmpty` in simulator
`linkd` logs. The catalog files contained the three intents, but the declarations
belonged to the static `RaveGuardNative` pod rather than the app target. A minimal
control app built with the same Xcode/SDK indexed successfully on the same iOS
18.6 runtime, so a phone OS update was not the prerequisite for registration.

Build 3 moves the declarations into the generated app target, retaining a small
main-actor facade into the live native controller. The new metadata owns all three
types under `RaveGuard` and has no package-only include file. iOS indexes the bundle
successfully; after Shortcuts refreshes its index, all three exact action IDs are
present in its ToolKit catalog. Simulator UI tests found all three actions in
Search Actions and resolved Begin/Get in the signed import preview, alongside
Apple's built-in control-flow and noise actions. No AirPods command was executed
by these UI tests. The preview additionally exposed empty App Intent String fields;
the generator now uses `WFTextTokenString` there and an existence operator for the
empty-relay guard. The signer/compiled-file checks alone had missed these defects.

The corrected Release build passed, was installed and launched on the connected
iPhone as build 3, and retains the same bundle and action identifiers as the shared
shortcut. The tester must use this native build, including on a separate UI branch.
Focused plugin/config tests (27), the native relay tests (7), TypeScript and lint
passed. Actual AirPods switching and sustained seamless operation remain unverified.

**Backend-selection follow-up, build 4:** The Background relay chip was present,
but the JavaScript wrapper still allowed only bridge, shortcuts and off. A Debug
screen regression reproduced a tap making zero native calls. Adding `automation`
to that allowlist lets the real wrapper forward the selection and display
`Backend: automation · not connected` until the relay confirms a command. The
regression now passes along with the native-wrapper, Debug screen and control
suites (80 tests); TypeScript and lint also pass. The signed shortcut needs no
change for this fix.

**AirPods connection follow-up, build 4:** Starting a session could produce a
stream of connected/disconnected dialogs. `HeadMotionStream` unconditionally
stopped and restarted updates on every connected callback, including a callback
from an already active stream. A regression reproduced repeated restarts; a fake
provider now also echoes connection callbacks from start/stop. Connected callbacks
leave active updates alone, disconnect stops active updates, and reconnect starts
only inactive updates. The UI separately waits 1.5 seconds for a stable connection
change before showing a dialog. Transient alternation no longer queues dialogs;
persistent disconnects and reconnects still report normally. Native connection
state and relay invalidation remain immediate. Focused app tests (104) and motion,
runtime and relay Swift tests (31) pass. Physical startup and noise switching still
need a wearer check after installation.

Earlier investigation history:

Physical-device follow-up on October 17: build 1 installed and launched on the
iPhone 17 Pro running iOS 26.6.2, but the wearer could not find the relay actions in
Shortcuts. No mode-switch or endurance result was obtained. Build 2 adds an explicit
app-level `AppShortcutsProvider`, calls `updateAppShortcutParameters()` at launch,
and increments the iOS build number so the revised catalog can be indexed. Action
visibility on the phone still requires wearer confirmation. Build 2 passed the
physical-device Release build, was installed and launched on the phone, and its
metadata contains three preconfigured shortcuts as well as the three action
definitions. The updated plugin/config checks passed (27 tests), as did TypeScript
and lint.

- App: 573 Jest tests across 49 suites passed; TypeScript and Expo lint passed.
- Native core: 236 Swift tests across 31 suites passed. Relay coverage includes
  automatic meter-to-ANC output without URL opening, exact acknowledgements,
  dwell/coalescing, superseded runners, disconnection, and heartbeat expiry.
- All iOS Swift core sources, including App Intents, typechecked against the
  installed iPhoneOS SDK with an iOS 17 deployment target.
- Expo prebuild and CocoaPods installation completed. Build 3's config plugin
  generates app-target intents idempotently instead of a framework package include.
- Full ARM64 iOS simulator workspace build passed with Xcode 27.1. The final app's
  `Metadata.appintents/extract.actionsdata` contains all three relay actions, each
  with `openAppWhenRun = false` (checked programmatically).
- The paired physical iPhone was unavailable during the initial automated checks.
  See the physical-device follow-up above for the later installation/discovery result;
  acoustic behavior, automation UI, and sustained locked execution remain unverified.

## Sources

- [Apple: run a shortcut using a URL scheme](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios)
- [Apple: automatic personal automations](https://support.apple.com/en-euro/guide/shortcuts/-apd602971e63/ios)
- [Apple WWDC22: background App Intents run in the app process](https://developer.apple.com/videos/play/wwdc2022/10032/)
- [Apple: framework App Intents packages](https://developer.apple.com/documentation/appintents/appintentspackage)
- [Apple: registering App Shortcuts at launch](https://developer.apple.com/documentation/appintents/acceleratingappinteractionswithappintents)
- [Apple: Guided Access/Single App mode eligibility](https://developer.apple.com/documentation/uikit/uiaccessibility/requestguidedaccesssession(enabled:completionhandler:))
- [Apple: RunSystemShortcutIntent only performs widget button actions](https://developer.apple.com/documentation/appintents/runsystemshortcutintent/perform())
- [Runtime header: BluetoothDevice selectors](https://github.com/nst/iOS-Runtime-Headers/blob/master/PrivateFrameworks/BluetoothManager.framework/BluetoothDevice.h)
- [Primary reverse-engineering report: macOS AirPods control, observed failures and limits](https://github.com/BorgoGustavo/airpods-ctl)
