import Foundation

/// One head-motion reading, in CoreMotion's units: radians, rad/s and g.
/// `t` is seconds on a monotonic clock (CMDeviceMotion.timestamp, or seconds since the
/// start of a recording).
public struct MotionSample: Equatable, Sendable {
    public var t: TimeInterval
    public var pitch: Double, roll: Double, yaw: Double
    public var rotX: Double, rotY: Double, rotZ: Double
    public var accX: Double, accY: Double, accZ: Double
    public var gravX: Double, gravY: Double, gravZ: Double

    public init(t: TimeInterval, pitch: Double, roll: Double, yaw: Double,
                rotX: Double, rotY: Double, rotZ: Double,
                accX: Double, accY: Double, accZ: Double,
                gravX: Double = 0, gravY: Double = 0, gravZ: Double = 0) {
        self.t = t; self.pitch = pitch; self.roll = roll; self.yaw = yaw
        self.rotX = rotX; self.rotY = rotY; self.rotZ = rotZ
        self.accX = accX; self.accY = accY; self.accZ = accZ
        self.gravX = gravX; self.gravY = gravY; self.gravZ = gravZ
    }

    /// |user acceleration| in g (gravity already removed by CoreMotion).
    public var accelG: Double { (accX * accX + accY * accY + accZ * accZ).squareRoot() }
    /// |rotation rate| in rad/s.
    public var rotationRate: Double { (rotX * rotX + rotY * rotY + rotZ * rotZ).squareRoot() }
    public var pitchDeg: Double { pitch * 180 / .pi }
    public var rollDeg: Double { roll * 180 / .pi }
    public var yawDeg: Double { yaw * 180 / .pi }
    var hasGravity: Bool { gravX != 0 || gravY != 0 || gravZ != 0 }
}

/// What the Debug panel shows, sent at 10 Hz as `onMotion` (A13 / J13).
struct MotionReadout: Equatable, Sendable {
    let state: MotionState
    let pitchDeg: Double
    let rollDeg: Double
    let accelG: Double
    let at: Date

    /// `onMotion` payload for the Expo module.
    var modulePayload: [String: Any] {
        ["state": state.rawValue, "pitch": pitchDeg, "roll": rollDeg, "accelG": accelG,
         "at": at.timeIntervalSince1970 * 1000]
    }
}
