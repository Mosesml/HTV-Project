import Foundation
#if canImport(CoreLocation)
import CoreLocation
#endif

/// AN10 / PRV-2: where the wearer's location comes from. `SessionManager` asks for one fix when a
/// check-in starts and for live updates only while an escalation is open (including a silent
/// duress one); at no other time is location requested, and none of it is stored on the phone.
@MainActor
protocol LocationSource: AnyObject {
    /// The wearer started a session (foreground, a deliberate tap): ask for permission if needed
    /// and keep When-In-Use valid while the screen is off. Requests no location by itself.
    func beginSession()
    func endSession()
    /// One fix, the best within a few seconds; nil if none could be had (denied, no signal).
    func requestFix(_ done: @escaping @MainActor (GeoPoint?) -> Void)
    /// Live fixes as the wearer moves, until `stopUpdates`.
    func startUpdates(_ each: @escaping @MainActor (GeoPoint) -> Void)
    func stopUpdates()
}

#if canImport(CoreLocation)
extension GeoPoint {
    init(_ l: CLLocation) {
        self.init(lat: l.coordinate.latitude, lon: l.coordinate.longitude,
                  accuracyM: max(0, l.horizontalAccuracy), at: l.timestamp)
    }
}
#endif

#if os(iOS)

/// CoreLocation behind `LocationSource`. A check-in usually starts with the phone locked; with
/// only When-In-Use permission iOS won't start location from the background, so a
/// `CLBackgroundActivitySession` is held for the length of the session (iOS shows its location
/// indicator). The `location` background mode is in app.json.
@MainActor
final class CoreLocationSource: NSObject, LocationSource, CLLocationManagerDelegate {
    /// A fix this good ends `requestFix` early.
    var goodEnoughM: CLLocationAccuracy = 100
    /// Otherwise the best fix seen by then.
    var fixTimeout: TimeInterval = 10
    /// Live updates: only after moving this far.
    var distanceFilterM: CLLocationDistance = 20

    private let manager = CLLocationManager()
    private var backgroundSession: AnyObject?
    private var pendingFixes: [@MainActor (GeoPoint?) -> Void] = []
    private var bestPending: CLLocation?
    private var fixTimer: Timer?
    private var live: (@MainActor (GeoPoint) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.pausesLocationUpdatesAutomatically = false
        manager.activityType = .other
    }

    func beginSession() {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        #if os(iOS)
        if backgroundSession == nil { backgroundSession = CLBackgroundActivitySession() }
        if Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes").map({ "\($0)".contains("location") }) == true {
            manager.allowsBackgroundLocationUpdates = true
        }
        #endif
    }

    func endSession() {
        stopUpdates()
        finishFix(with: nil)
        #if os(iOS)
        (backgroundSession as? CLBackgroundActivitySession)?.invalidate()
        #endif
        backgroundSession = nil
    }

    func requestFix(_ done: @escaping @MainActor (GeoPoint?) -> Void) {
        guard authorized else { done(nil); return }
        pendingFixes.append(done)
        guard fixTimer == nil else { return }
        bestPending = nil
        manager.distanceFilter = kCLDistanceFilterNone
        manager.startUpdatingLocation()
        fixTimer = Timer.scheduledTimer(withTimeInterval: fixTimeout, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.finishFix(with: self?.bestPending) }
        }
    }

    func startUpdates(_ each: @escaping @MainActor (GeoPoint) -> Void) {
        guard authorized else { return }
        live = each
        manager.distanceFilter = pendingFixes.isEmpty ? distanceFilterM : kCLDistanceFilterNone
        manager.startUpdatingLocation()
    }

    func stopUpdates() {
        live = nil
        if pendingFixes.isEmpty { manager.stopUpdatingLocation() }
    }

    private var authorized: Bool {
        [.authorizedWhenInUse, .authorizedAlways].contains(manager.authorizationStatus)
    }

    private func finishFix(with location: CLLocation?) {
        fixTimer?.invalidate(); fixTimer = nil
        let waiting = pendingFixes
        pendingFixes = []
        bestPending = nil
        if live == nil { manager.stopUpdatingLocation() } else { manager.distanceFilter = distanceFilterM }
        waiting.forEach { $0(location.map(GeoPoint.init)) }
    }

    private func received(_ locations: [CLLocation]) {
        // Ignore cached fixes from before this request and readings with no accuracy.
        let fresh = locations.filter { $0.horizontalAccuracy >= 0 && $0.timestamp.timeIntervalSinceNow > -15 }
        guard let latest = fresh.last else { return }
        if !pendingFixes.isEmpty {
            if bestPending == nil || latest.horizontalAccuracy < bestPending!.horizontalAccuracy { bestPending = latest }
            if latest.horizontalAccuracy <= goodEnoughM { finishFix(with: latest) }
        }
        if let live, latest.horizontalAccuracy <= 200 { live(GeoPoint(latest)) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated { received(locations) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // kCLErrorLocationUnknown is transient; anything else (denied) ends a pending fix empty.
        guard (error as? CLError)?.code != .locationUnknown else { return }
        MainActor.assumeIsolated { finishFix(with: bestPending) }
    }
}
#endif
