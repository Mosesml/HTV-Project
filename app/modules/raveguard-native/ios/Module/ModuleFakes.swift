import Foundation

// Stand-ins the module runs on until the real pieces land (J12 swaps them in
// `RaveGuardRuntime.withFakes`).

/// Session log kept in memory: tests, and the fallback when `SessionLog`'s file can't be opened.
final class InMemorySessionLog: SessionLogging {
    private(set) var events: [SessionEvent] = []
    func append(_ e: SessionEvent) { events.append(e) }
}

/// Remembers the level and touches no AirPods, until Moses's `BridgeController` and
/// `ShortcutsController` (M3, M4).
final class FakeNoiseController: NoiseController {
    private(set) var level = 0
    func apply(level: Int) { self.level = level }
}
