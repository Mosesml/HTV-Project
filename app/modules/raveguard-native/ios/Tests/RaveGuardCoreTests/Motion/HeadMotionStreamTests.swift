import Foundation
import Testing
@testable import RaveGuardCore

/// Fake AirPods: delivers samples on demand and can be "taken out" and "put back".
final class FakeHeadphones: HeadphoneMotionProvider, @unchecked Sendable {
    var isAvailable = true
    var isAuthorized = true
    private(set) var isActive = false
    private(set) var startCount = 0
    private var handler: ((MotionSample?, Error?) -> Void)?
    var onConnectionChange: ((Bool) -> Void)?
    /// Like the real manager, a disconnect silently stops delivery.
    private var connected = true

    func startUpdates(_ handler: @escaping (MotionSample?, Error?) -> Void) {
        startCount += 1; isActive = true; self.handler = handler
    }
    func stopUpdates() { isActive = false; handler = nil }

    /// Returns whether the sample was delivered.
    @discardableResult
    func emit(_ s: MotionSample) -> Bool {
        guard connected, isActive, let handler else { return false }
        handler(s, nil); return true
    }
    func fail() { handler?(nil, NSError(domain: "CMErrorDomain", code: 109)) }
    func takeOut() { connected = false; handler = nil; onConnectionChange?(false) }
    func putBack() { connected = true; onConnectionChange?(true) }
}

private struct Collected<T: Sendable>: Sendable {
    let task: Task<[T], Never>
    init(_ stream: AsyncStream<T>, count: Int) {
        task = Task {
            var out: [T] = []
            for await v in stream { out.append(v); if out.count >= count { break } }
            return out
        }
    }
}

@Suite struct HeadMotionStreamTests {

    private func sample(_ t: Double, pitchDeg: Double = 0) -> MotionSample {
        MotionSample(t: t, pitch: pitchDeg * .pi / 180, roll: 0, yaw: 0,
                     rotX: 0, rotY: 0, rotZ: 0, accX: 0.01, accY: 0, accZ: 0)
    }

    @Test func startFailsClearlyWithoutHeadphoneMotion() {
        let fake = FakeHeadphones()
        fake.isAvailable = false
        #expect(throws: HeadMotionError.unavailable) { try HeadMotionStream(provider: fake).start() }
        fake.isAvailable = true; fake.isAuthorized = false
        #expect(throws: HeadMotionError.notAuthorized) { try HeadMotionStream(provider: fake).start() }
    }

    @Test func publishesSamples() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        let got = Collected(stream.samples, count: 3)
        try stream.start()
        for i in 0..<3 { fake.emit(sample(Double(i) / 50)) }
        let values = await got.task.value
        #expect(values.map(\.t) == [0, 0.02, 0.04])
    }

    @Test func survivesAirPodsOutAndBackIn() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        let connection = Collected(stream.airPodsConnected, count: 3)
        try stream.start()
        #expect(fake.emit(sample(0)))
        fake.takeOut()
        #expect(!fake.emit(sample(1)))
        fake.putBack()
        #expect(fake.startCount == 2)
        #expect(fake.emit(sample(2)))
        #expect(await connection.task.value == [true, false, true])
        #expect(stream.isRunning)
    }

    @Test func restartsAfterAnUpdateError() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        stream.restartDelay = 0.01
        try stream.start()
        fake.fail()
        for _ in 0..<200 where fake.startCount < 2 { try await Task.sleep(nanoseconds: 2_000_000) }
        #expect(fake.startCount == 2)
        #expect(fake.emit(sample(0)))
    }

    /// iOS may not call `headphoneMotionManagerDidConnect` for AirPods already in the ears
    /// when updates start, so the first sample says they are connected, once.
    @Test func firstSampleReportsConnectedOnce() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        let connection = Collected(stream.airPodsConnected, count: 2)
        try stream.start()
        for i in 0..<5 { fake.emit(sample(Double(i) / 50)) }
        fake.takeOut()
        #expect(await connection.task.value == [true, false])
    }

    @Test func reconnectReportsConnectedOnceAndItsSamplesDoNotRepeatIt() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        let connection = Collected(stream.airPodsConnected, count: 4)
        try stream.start()
        fake.emit(sample(0))
        fake.takeOut()
        fake.putBack()
        for i in 1..<5 { fake.emit(sample(Double(i) / 50)) }
        fake.takeOut()
        #expect(await connection.task.value == [true, false, true, false])
    }

    @Test func deniedMotionPermissionStopsTheRetries() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        stream.restartDelay = 0.01
        try stream.start()
        fake.isAuthorized = false   // Motion & Fitness turned off mid-session
        fake.fail()
        try await Task.sleep(nanoseconds: 50_000_000)
        #expect(fake.startCount == 1)
        #expect(!fake.isActive)
        #expect(!stream.isRunning)
    }

    @Test func reconnectAfterStopDoesNotRestart() throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        try stream.start()
        stream.stop()
        fake.takeOut(); fake.putBack()
        #expect(fake.startCount == 1)
        #expect(!fake.isActive)
    }

    @Test func detectsANodEndToEndWhileListening() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        let nods = Collected(stream.nods, count: 1)
        try stream.start()
        stream.setListeningForNod(true)
        var g = SyntheticMotion(seed: 41)
        let take = g.nod(variant: 1)
        // Let the listening flag land on the motion queue first.
        try await Task.sleep(nanoseconds: 20_000_000)
        for s in take.samples { fake.emit(s) }
        let got = await nods.task.value
        #expect(got.count == 1)
    }

    @Test func readoutsArriveAtTenHertz() async throws {
        let fake = FakeHeadphones()
        let stream = HeadMotionStream(provider: fake)
        let readouts = Collected(stream.readouts, count: 20)
        try stream.start()
        for i in 0..<100 { fake.emit(sample(Double(i) / 50, pitchDeg: Double(i))) }   // 2 s at 50 Hz
        let got = await readouts.task.value
        #expect(got.count == 20)
        #expect(abs(stream.measuredHz - 50) < 1)
    }

    @Test func recorderCapturesWhatTheStreamSees() throws {
        let fake = FakeHeadphones()
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("rg-rec-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let stream = HeadMotionStream(provider: fake, recorder: MotionRecorder(directory: dir))
        try stream.start()
        stream.recorder.start(label: "nod", person: "Justin")
        for i in 0..<50 { fake.emit(sample(100 + Double(i) / 50)) }
        let url = try #require(try stream.recorder.stop())
        let take = try MotionCSV.decode(String(contentsOf: url, encoding: .utf8))
        #expect(url.lastPathComponent == "justin_nod_01.csv")
        #expect(take.label == "nod")
        #expect(take.samples.count == 50)
        #expect(take.samples.first?.t == 0)   // re-based to the start of the take
    }
}

@Suite struct MotionRecorderTests {

    @Test func numbersTakesPerPersonAndLabel() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("rg-rec-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let rec = MotionRecorder(directory: dir)
        var names: [String] = []
        for label in ["fall", "fall", "nod"] {
            rec.start(label: label, person: "Kean M")
            rec.add(MotionSample(t: 0, pitch: 0, roll: 0, yaw: 0, rotX: 0, rotY: 0, rotZ: 0, accX: 0, accY: 0, accZ: 0))
            names.append(try #require(try rec.stop()).lastPathComponent)
        }
        #expect(names == ["kean-m_fall_01.csv", "kean-m_fall_02.csv", "kean-m_nod_01.csv"])
    }

    @Test func emptyTakeWritesNothing() throws {
        let rec = MotionRecorder(directory: FileManager.default.temporaryDirectory.appendingPathComponent("rg-\(UUID())"))
        #expect(try rec.stop() == nil)
        rec.start(label: "nod", person: "x")
        #expect(try rec.stop() == nil)
    }

    @Test func ignoresSamplesWhenNotRecording() {
        let rec = MotionRecorder()
        rec.add(MotionSample(t: 0, pitch: 0, roll: 0, yaw: 0, rotX: 0, rotY: 0, rotZ: 0, accX: 0, accY: 0, accZ: 0))
        #expect(!rec.isRecording)
        #expect(rec.sampleCount == 0)
    }
}
