// motion-probe: J1 on a Mac, plus quick recording and replay without Xcode.
//
//   Tools/MotionProbe/run.sh                       print AirPods pitch/roll/yaw + rate
//   Tools/MotionProbe/run.sh record nod justin 8   record an 8 s take to ./justin_nod_NN.csv
//   swift run motion-probe replay Motion/Fixtures  detections per class + J6/J7 verdicts
//
// Live and record go through run.sh, which wraps the binary in an .app so macOS asks
// for Motion permission instead of killing it (TCC blames the terminal otherwise).
//
// Needs macOS 14+ and AirPods with head tracking connected to this Mac. The first run
// asks for Motion & Fitness access (System Settings → Privacy & Security).

import CoreMotion
import Foundation
import RaveGuardCore

setvbuf(stdout, nil, _IOLBF, 0)
// Launched as an .app by run.sh, the working directory is /; record into the caller's.
if let dir = ProcessInfo.processInfo.environment["MOTION_PROBE_DIR"] {
    FileManager.default.changeCurrentDirectoryPath(dir)
}
let args = Array(CommandLine.arguments.dropFirst())

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

if args.first == "replay" {
    let dir = URL(fileURLWithPath: args.count > 1 ? args[1] : "Motion/Fixtures")
    do {
        let report = try MotionReplay.run(directory: dir)
        if report.takes.isEmpty { fail("No .csv takes in \(dir.path)") }
        print(report.table)
        for t in report.takes where !t.falls.isEmpty || t.nods > 0 {
            print("  \(t.name): \(t.falls.count) fall(s) \(t.falls) · \(t.nods) nod(s)")
        }
        exit(report.verdicts.allSatisfy(\.pass) ? 0 : 2)
    } catch {
        fail("replay failed: \(error)")
    }
}

let recording: (label: String, person: String, seconds: Double)?
if args.first == "record" {
    guard args.count >= 3 else { fail("usage: motion-probe record <label> <person> [seconds]") }
    recording = (args[1], args[2], args.count > 3 ? Double(args[3]) ?? 10 : 10)
} else {
    recording = nil
}

let manager = CMHeadphoneMotionManager()
guard manager.isDeviceMotionAvailable else { fail("Headphone motion is not available on this Mac.") }
switch CMHeadphoneMotionManager.authorizationStatus() {
case .denied, .restricted: fail("Motion access denied. Allow it in System Settings → Privacy & Security → Motion & Fitness.")
default: break
}

final class Delegate: NSObject, CMHeadphoneMotionManagerDelegate {
    func headphoneMotionManagerDidConnect(_ manager: CMHeadphoneMotionManager) { print("AirPods connected") }
    func headphoneMotionManagerDidDisconnect(_ manager: CMHeadphoneMotionManager) { print("AirPods disconnected") }
}
let delegate = Delegate()
manager.delegate = delegate

var samples: [MotionSample] = []
var windowStart: TimeInterval?
var windowCount = 0
var hz = 0.0
var printed = 0
let started = Date()

print(recording.map { "Recording \($0.label) for \(Int($0.seconds)) s… (start upright)" }
      ?? "Waiting for AirPods head motion… move your head. Ctrl-C to stop.")

manager.startDeviceMotionUpdates(to: OperationQueue.main) { motion, error in
    if let error { print("motion error: \(error.localizedDescription)"); return }
    guard let motion else { return }
    let s = MotionSample(motion)
    if windowStart == nil { windowStart = s.t }
    windowCount += 1
    if s.t - windowStart! >= 1 {
        hz = Double(windowCount - 1) / (s.t - windowStart!)
        windowStart = s.t; windowCount = 1
    }
    if let rec = recording {
        samples.append(s)
        if Date().timeIntervalSince(started) >= rec.seconds {
            manager.stopDeviceMotionUpdates()
            let key = "\(rec.person.lowercased())_\(rec.label)"
            var n = 1
            while FileManager.default.fileExists(atPath: String(format: "%@_%02d.csv", key, n)) { n += 1 }
            let name = String(format: "%@_%02d.csv", key, n)
            let csv = MotionCSV.encode(.init(meta: ["label": rec.label, "person": rec.person.lowercased()], samples: samples))
            do { try csv.write(toFile: name, atomically: true, encoding: .utf8) } catch { fail("write failed: \(error)") }
            print(String(format: "Wrote %@: %d samples at %.0f Hz", name, samples.count, hz))
            exit(0)
        }
    }
    printed += 1
    if printed % 10 == 0 {
        print(String(format: "pitch %7.1f°  roll %7.1f°  yaw %7.1f°  |a| %.2f g  %.0f Hz",
                     s.pitchDeg, s.rollDeg, s.yawDeg, s.accelG, hz))
    }
}

// Nothing arriving after 10 s usually means no head-tracking AirPods are connected.
DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
    if windowStart == nil {
        print("No samples after 10 s. Are head-tracking AirPods connected to this Mac and in your ears?")
    }
}
RunLoop.main.run()
