import Foundation

// Payloads for `onEscalation`, `onNoise` and `onHearing`. `onPhase` and `onMotion` use
// Justin's `SessionPhase.modulePayload` and `MotionReadout.modulePayload`. Times are epoch
// milliseconds, like his; shapes match src/RaveGuardNative.types.ts.

extension RecipientStatus {
    var modulePayload: [String: Any?] {
        ["name": name, "kind": kind.rawValue,
         "notifiedAt": notifiedAt.map { $0.timeIntervalSince1970 * 1000 },
         "ackedAt": ackedAt.map { $0.timeIntervalSince1970 * 1000 }]
    }
}

extension EscalationStatus {
    var modulePayload: [String: Any?] {
        ["state": state, "recipients": recipients.map(\.modulePayload), "sosOpen": sosOpen]
    }
}

enum NoiseBackendKind: String, CaseIterable, Sendable { case bridge, shortcuts, off }

/// What `onNoise` reports. Moses's controllers (M3, M4) will set `connected` for real.
struct NoiseState: Equatable, Sendable {
    var backend: NoiseBackendKind = .off
    var connected = false
    var level = 0

    var modulePayload: [String: Any?] {
        ["backend": backend.rawValue, "connected": connected, "level": level]
    }
}

/// What `onHearing` reports. The readings stay null until a level source reports (BL1).
struct HearingState: Equatable, Sendable {
    var roomDb: Double?
    var dosePercent: Double?
    var mode: ProtectionMode = .auto
    /// The estimated level in the wearer's ears: room dB minus the AirPods mode's attenuation
    /// (the dose counts this). Null with no reading.
    var inEarDb: Double?
    /// The protection floor the level loop keeps (HRG-3), rising with the dose. Null with no
    /// reading and in manual, where the slider has no floor.
    var floorLevel: Int?

    var modulePayload: [String: Any?] {
        ["roomDb": roomDb, "dosePercent": dosePercent, "mode": mode.rawValue,
         "inEarDb": inEarDb, "floorLevel": floorLevel]
    }
}
