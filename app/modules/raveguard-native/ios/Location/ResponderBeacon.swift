import Foundation

/// The server side of being a nearby responder (J15): `ServerClient` in the app.
protocol ResponderReporting: AnyObject, Sendable {
    func reportResponder(name: String, phoneE164: String, fix: GeoPoint) async throws
    func clearResponder() async
}

extension ServerClient: ResponderReporting {}

/// J15: while this phone's own session runs and its owner opted in, tells the server roughly
/// where they are, so an unanswered alert near them can reach them. An explicit opt-in, separate
/// from PRV-2: the wearer's own safety location is still only ever sent during a check-in.
///
/// It has its own `LocationSource` (a separate CLLocationManager), so `SessionManager`'s
/// check-in-only location stays independent of it. A report goes out on the first fix, after
/// moving 100 m, or every 2 minutes so the server's 10-minute freshness never lapses.
@MainActor
final class ResponderBeacon {
    struct Settings: Equatable, Sendable {
        var name: String
        var phoneE164: String
    }

    static let refreshInterval: TimeInterval = 120
    static let moveThresholdM: Double = 100

    private let location: LocationSource?
    private let reporter: ResponderReporting?
    private let clock: SessionClock
    private var settings: Settings?
    private var sessionActive = false
    private(set) var isRunning = false
    private var latest: GeoPoint?
    private var lastReported: (fix: GeoPoint, at: Date)?
    private var refreshTimer: SessionTimer?
    private var inflight: [UUID: Task<Void, Never>] = [:]

    init(location: LocationSource?, reporter: ResponderReporting?, clock: SessionClock) {
        self.location = location
        self.reporter = reporter
        self.clock = clock
    }

    /// From `configure()`: nil turns responder mode off.
    func configure(_ settings: Settings?) {
        let changed = settings != self.settings
        self.settings = settings
        if changed { lastReported = nil }
        reconcile()
        if changed, isRunning, let latest { report(latest) }
    }

    func sessionStarted() { sessionActive = true; reconcile() }
    func sessionEnded() { sessionActive = false; reconcile() }

    private func reconcile() {
        let want = sessionActive && settings != nil && location != nil && reporter != nil
        if want && !isRunning {
            isRunning = true
            location?.beginSession()
            location?.requestFix { [weak self] fix in if let fix { self?.received(fix) } }
            location?.startUpdates { [weak self] fix in self?.received(fix) }
            scheduleRefresh()
        } else if !want && isRunning {
            isRunning = false
            location?.stopUpdates()
            location?.endSession()
            refreshTimer?.cancel(); refreshTimer = nil
            latest = nil; lastReported = nil
            if let reporter { spawn { await reporter.clearResponder() } }
        }
    }

    private func received(_ fix: GeoPoint) {
        guard isRunning else { return }
        latest = fix
        guard let last = lastReported else { report(fix); return }
        if Self.distanceM(last.fix, fix) >= Self.moveThresholdM
            || clock.now.timeIntervalSince(last.at) >= Self.refreshInterval { report(fix) }
    }

    private func scheduleRefresh() {
        refreshTimer = clock.schedule(after: Self.refreshInterval) { [weak self] in
            guard let self, self.isRunning else { return }
            if let latest = self.latest { self.report(latest) }
            self.scheduleRefresh()
        }
    }

    private func report(_ fix: GeoPoint) {
        guard let settings, let reporter else { return }
        lastReported = (fix, clock.now)
        // A failure (no server session yet, offline) is retried by the next fix or refresh.
        spawn { try? await reporter.reportResponder(name: settings.name, phoneE164: settings.phoneE164, fix: fix) }
    }

    private func spawn(_ work: @escaping @Sendable () async -> Void) {
        let id = UUID()
        inflight[id] = Task { [weak self] in
            await work()
            self?.inflight[id] = nil
        }
    }

    /// For tests: waits for reports already started.
    func settle() async {
        while let (id, task) = inflight.first { await task.value; inflight[id] = nil }
    }

    nonisolated static func distanceM(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        let rad = Double.pi / 180, r = 6_371_000.0
        let dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(a.lat * rad) * cos(b.lat * rad) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * asin(min(1, h.squareRoot()))
    }
}
