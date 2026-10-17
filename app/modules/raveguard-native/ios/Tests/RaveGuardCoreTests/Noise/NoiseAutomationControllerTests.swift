import Foundation
import Testing
@testable import RaveGuardCore

@MainActor
@Suite struct NoiseAutomationControllerTests {
    @Test func needsAnAcknowledgementAndRejectsUnrelatedRequests() {
        let c = NoiseAutomationController()
        c.activate()
        c.apply(level: 80)
        let runner = c.beginRelay()
        let command = c.next(runner: runner)
        #expect(command.action == "noiseCancellation")
        #expect(!c.connected)
        #expect(!c.acknowledge(runner: runner, request: "unrelated"))
        #expect(c.next(runner: runner) == command)
        #expect(c.acknowledge(runner: runner, request: command.request))
        #expect(c.connected)
        #expect(c.next(runner: runner).action == "wait")
    }

    @Test func latestInputWinsAfterDwellAndNeverInterruptsAnInflightAction() {
        let s = RelayTestScheduler()
        let c = NoiseAutomationController(scheduler: s)
        c.activate()
        let runner = c.beginRelay()
        let adaptive = c.next(runner: runner)
        c.apply(level: 80)
        #expect(c.next(runner: runner) == adaptive)
        #expect(c.acknowledge(runner: runner, request: adaptive.request))
        #expect(!c.connected)
        s.clock.advance(by: 1)
        #expect(c.next(runner: runner).action == "wait")
        c.apply(level: 20)
        #expect(c.next(runner: runner).action == "wait")
        #expect(c.connected)
        c.apply(level: 100)
        s.clock.advance(by: 1)
        #expect(c.next(runner: runner).action == "noiseCancellation")
    }

    @Test func stoppedRelayLosesConfirmationAndMustReapply() {
        let s = RelayTestScheduler()
        let c = NoiseAutomationController(scheduler: s)
        c.activate()
        let runner = c.beginRelay()
        let command = c.next(runner: runner)
        #expect(c.acknowledge(runner: runner, request: command.request))
        s.clock.advance(by: 15)
        #expect(!c.connected)
        let retry = c.next(runner: runner)
        #expect(retry.action == "adaptive")
        #expect(retry.request != command.request)
        #expect(!c.acknowledge(runner: runner, request: command.request))
    }

    @Test func newRunnerAndResetInvalidateOldCommands() {
        let c = NoiseAutomationController()
        c.activate()
        let oldRunner = c.beginRelay()
        let oldCommand = c.next(runner: oldRunner)
        let runner = c.beginRelay()
        #expect(c.next(runner: oldRunner).action == "stop")
        #expect(!c.acknowledge(runner: oldRunner, request: oldCommand.request))
        let command = c.next(runner: runner)
        c.reset()
        #expect(c.next(runner: runner).action == "stop")
        #expect(!c.acknowledge(runner: runner, request: command.request))
        #expect(!c.connected)
    }

    @Test func airPodsDisconnectRequiresAReapplication() {
        let c = NoiseAutomationController()
        c.activate()
        let runner = c.beginRelay()
        let command = c.next(runner: runner)
        #expect(c.acknowledge(runner: runner, request: command.request))
        c.invalidateOutput()
        #expect(!c.connected)
        #expect(c.next(runner: runner).action == "adaptive")
    }

    @Test func reopeningTheAppDoesNotBypassTheDwell() {
        let s = RelayTestScheduler()
        let c = NoiseAutomationController(scheduler: s)
        c.activate()
        let first = c.beginRelay()
        let command = c.next(runner: first)
        #expect(c.acknowledge(runner: first, request: command.request))
        s.clock.advance(by: 1)
        let second = c.beginRelay()
        c.apply(level: 90)
        #expect(c.next(runner: second).action == "wait")
        s.clock.advance(by: 1)
        #expect(c.next(runner: second).action == "noiseCancellation")
    }

    @Test func runtimeDoesNotLaunchURLsWhenAutomationIsSelected() async throws {
        let relayScheduler = RelayTestScheduler()
        let relay = NoiseAutomationController(scheduler: relayScheduler)
        let clock = ManualSessionClock()
        let mic = ScriptedLevelSource()
        let opener = RecordingRelayURLOpener()
        let shortcuts = ShortcutsController(opener: opener, scheduler: RelayTestScheduler())
        let runtime = RaveGuardRuntime(clock: clock, escalation: FakeEscalationService(),
            motion: FakeMotionSource(), log: InMemorySessionLog(),
            shortcutsController: shortcuts, automationController: relay,
            audioSession: RecordingAudioSession(), levels: mic, emit: { _, _ in })
        try runtime.configure(ModuleSettingsTests.settings(["recipients": [], "demo": false]))
        try runtime.setNoiseBackend("automation")
        runtime.startSession()
        await runtime.session.settle()
        for _ in 0..<20 { mic.send(115) }
        #expect(runtime.hearingState.mode == .auto)
        #expect(runtime.noiseState.level >= 70)
        let runner = relay.beginRelay()
        let command = relay.next(runner: runner)
        #expect(command.action == "noiseCancellation")
        #expect(!runtime.noiseState.connected)
        #expect(relay.acknowledge(runner: runner, request: command.request))
        #expect(runtime.noiseState.connected)
        relayScheduler.clock.advance(by: 15)
        #expect(!runtime.noiseState.connected)
        #expect(opener.openedURLs.isEmpty)
        #expect(runtime.stopSession())
        #expect(relay.next(runner: runner).action == "stop")
        runtime.startSession()
        await runtime.session.settle()
        let restartedRunner = relay.beginRelay()
        #expect(relay.next(runner: restartedRunner).action != "stop")
        try runtime.setNoiseBackend("off")
        #expect(relay.next(runner: restartedRunner).action == "stop")
        #expect(!runtime.noiseState.connected)
        #expect(runtime.stopSession())
        runtime.shutdown()
    }
}

private final class RecordingRelayURLOpener: ShortcutURLOpening {
    var openedURLs: [URL] = []
    func open(_ url: URL, completion: @escaping (Bool) -> Void) {
        openedURLs.append(url)
        completion(true)
    }
}

private final class RelayTestScheduler: NoiseDwellScheduling {
    let clock: ManualSessionClock
    @MainActor init() { clock = ManualSessionClock() }
    var now: Date { MainActor.assumeIsolated { clock.now } }
    func schedule(after delay: TimeInterval, _ action: @escaping () -> Void) -> NoiseScheduledAction {
        MainActor.assumeIsolated {
            RelayTimer(clock.schedule(after: delay, action))
        }
    }
    private final class RelayTimer: NoiseScheduledAction {
        let timer: SessionTimer
        init(_ timer: SessionTimer) { self.timer = timer }
        func cancel() { MainActor.assumeIsolated { timer.cancel() } }
    }
}
