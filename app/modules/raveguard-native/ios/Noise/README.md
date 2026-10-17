# Native AirPods noise control

`ShortcutsController` is RaveGuard's iPhone-only noise backend. It deliberately uses
public iOS behavior: the app launches user-created Shortcuts which switch the connected
AirPods' listening mode. It does not use private frameworks or claim to control the
Adaptive Audio preference from 0 to 100.

## Protection policy

| RaveGuard level | Requested AirPods mode |
| --- | --- |
| 0–69 | Adaptive |
| 70–100 | Noise Cancellation |

The input remains a 0–100 RaveGuard protection value. It is not a percentage of sound
blocked. The default 25-second dwell prevents repeated app switching near the threshold.

## One-time setup on the demo iPhone

AirPods must be connected while creating the actions.

1. In Shortcuts, create `RG Adaptive` with one **Set Noise Control Mode** action set to
   the demo AirPods and **Adaptive**.
2. Create `RG Noise Cancellation` with the same action set to **Noise Cancellation**.
3. Confirm the app URL scheme is `raveguard` (already declared by the Expo configuration).
4. Run both shortcuts manually once and accept any permission prompts.

The controller opens a URL such as:

```text
shortcuts://x-callback-url/run-shortcut?name=RG%20Adaptive&x-success=raveguard%3A%2F%2Fnoise%2Fsuccess...
```

Shortcuts briefly becomes the foreground app and returns to RaveGuard. That transition is
an iOS limitation and should remain visible in the demo rather than being presented as a
silent system API.

## Native-module wiring

Construct one controller and keep it alive for the session:

```swift
let noiseController = ShortcutsController()

noiseController.onStateChange = { state in
    // Forward through `onNoise` once RaveGuardModule.swift lands.
}

// Manual slider or the future automatic hearing loop:
noiseController.apply(level: level)
```

Forward incoming `raveguard://noise/...` URLs to:

```swift
noiseController.handleCallbackURL(url)
```

Opening a Shortcut only confirms that iOS accepted the URL. The `/success` callback means
the Shortcut finished; neither result measures actual acoustic attenuation.
