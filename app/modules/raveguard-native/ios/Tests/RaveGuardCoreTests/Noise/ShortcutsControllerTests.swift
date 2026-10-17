import Foundation
import Testing
@testable import RaveGuardCore

@MainActor
@Suite struct ShortcutsControllerTests {
    @Test func mapsProtectionLevelToAdaptiveOrANC() {
        let h = Harness()

        #expect(h.controller.mode(for: -10) == .adaptive)
        #expect(h.controller.mode(for: 0) == .adaptive)
        #expect(h.controller.mode(for: 69) == .adaptive)
        #expect(h.controller.mode(for: 70) == .noiseCancellation)
        #expect(h.controller.mode(for: 100) == .noiseCancellation)
        #expect(h.controller.mode(for: 110) == .noiseCancellation)
    }

    @Test func launchesAdaptiveShortcutWithReturnCallbacks() throws {
        let h = Harness()
        h.controller.apply(level: 42)

        let url = try #require(h.opener.openedURLs.first)
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(url.scheme == "shortcuts")
        #expect(url.host == "x-callback-url")
        #expect(url.path == "/run-shortcut")
        #expect(components.value(named: "name") == "RG Adaptive")
        #expect(components.value(named: "x-success")?.hasPrefix("raveguard://noise/success") == true)
        #expect(h.states.map(\.phase) == [.opening, .launched])
    }

    @Test func clampsLevelBeforePublishingAndBuildingCallback() throws {
        let h = Harness()
        h.controller.apply(level: 140)

        #expect(h.states.last?.level == 100)
        #expect(h.states.last?.mode == .noiseCancellation)

        let url = try #require(h.opener.openedURLs.first)
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        let success = try #require(components.value(named: "x-success"))
        #expect(success.contains("level=100"))
    }

    @Test func doesNotRelaunchTheCurrentMode() {
        let h = Harness()
        h.controller.apply(level: 10)
        h.controller.apply(level: 50)
        h.controller.apply(level: 69)

        #expect(h.opener.openedURLs.count == 1)
    }

    @Test func waitsForDwellBeforeSwitchingToANC() {
        let h = Harness()
        h.controller.apply(level: 20)
        h.scheduler.advance(by: 5)
        h.controller.apply(level: 80)

        #expect(h.opener.openedURLs.count == 1)
        guard case .scheduled(let date) = h.states.last?.phase else {
            Issue.record("Expected a scheduled transition")
            return
        }
        #expect(date == h.scheduler.now.addingTimeInterval(20))

        h.scheduler.advance(by: 19)
        #expect(h.opener.openedURLs.count == 1)
        h.scheduler.advance(by: 1)
        #expect(h.opener.openedURLs.count == 2)
        #expect(h.opener.shortcutNames == ["RG Adaptive", "RG Noise Cancellation"])
    }

    @Test func cancelsPendingANCWhenLevelDrops() {
        let h = Harness()
        h.controller.apply(level: 20)
        h.scheduler.advance(by: 5)
        h.controller.apply(level: 80)
        h.controller.apply(level: 30)
        h.scheduler.advance(by: 30)

        #expect(h.opener.openedURLs.count == 1)
    }

    @Test func retriesOnNextReadingWhenIOSRejectsTheURL() {
        let h = Harness()
        h.opener.shouldOpen = false
        h.controller.apply(level: 80)
        #expect(h.states.last?.phase == .failed)
        #expect(h.opener.openedURLs.count == 1)

        h.opener.shouldOpen = true
        h.controller.apply(level: 80)
        #expect(h.opener.openedURLs.count == 2)
        #expect(h.states.last?.phase == .launched)
    }

    @Test func handlesOnlyItsOwnCallbackURLs() throws {
        let h = Harness()
        h.controller.apply(level: 80)
        let shortcutURL = try #require(h.opener.openedURLs.first)
        let shortcutComponents = try #require(URLComponents(url: shortcutURL, resolvingAgainstBaseURL: false))
        let successString = try #require(shortcutComponents.value(named: "x-success"))
        let successURL = try #require(URL(string: successString))

        #expect(h.controller.handleCallbackURL(successURL))
        #expect(h.states.last == ShortcutsControllerState(
            level: 80,
            mode: .noiseCancellation,
            phase: .completed
        ))
        #expect(!h.controller.handleCallbackURL(URL(string: "raveguard://session/success")!))
        #expect(!h.controller.handleCallbackURL(URL(string: "other://noise/success?mode=adaptive")!))
    }
}

private extension ShortcutsControllerTests {
    final class Harness {
        let opener = FakeShortcutOpener()
        let scheduler = ManualNoiseScheduler()
        let controller: ShortcutsController
        var states: [ShortcutsControllerState] = []

        init() {
            controller = ShortcutsController(opener: opener, scheduler: scheduler)
            controller.onStateChange = { [weak self] in self?.states.append($0) }
        }
    }
}

private final class FakeShortcutOpener: ShortcutURLOpening {
    var shouldOpen = true
    private(set) var openedURLs: [URL] = []

    var shortcutNames: [String] {
        openedURLs.compactMap {
            URLComponents(url: $0, resolvingAgainstBaseURL: false)?.value(named: "name")
        }
    }

    func open(_ url: URL, completion: @escaping (Bool) -> Void) {
        openedURLs.append(url)
        completion(shouldOpen)
    }
}

private final class ManualNoiseScheduler: NoiseDwellScheduling {
    private(set) var now = Date(timeIntervalSince1970: 1_800_000_000)
    private var sequence = 0
    private var actions: [Entry] = []

    func schedule(after delay: TimeInterval, _ action: @escaping () -> Void) -> NoiseScheduledAction {
        sequence += 1
        let entry = Entry(
            date: now.addingTimeInterval(max(0, delay)),
            sequence: sequence,
            action: action
        )
        actions.append(entry)
        return entry
    }

    func advance(by interval: TimeInterval) {
        let end = now.addingTimeInterval(interval)
        while let next = actions
            .filter({ !$0.cancelled && $0.date <= end })
            .min(by: { ($0.date, $0.sequence) < ($1.date, $1.sequence) }) {
            now = next.date
            next.cancelled = true
            actions.removeAll(where: { $0.cancelled })
            next.action()
        }
        now = end
    }

    private final class Entry: NoiseScheduledAction {
        let date: Date
        let sequence: Int
        let action: () -> Void
        var cancelled = false

        init(date: Date, sequence: Int, action: @escaping () -> Void) {
            self.date = date
            self.sequence = sequence
            self.action = action
        }

        func cancel() {
            cancelled = true
        }
    }
}

private extension URLComponents {
    func value(named name: String) -> String? {
        queryItems?.first(where: { $0.name == name })?.value
    }
}
