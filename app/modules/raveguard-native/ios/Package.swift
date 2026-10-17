// swift-tools-version:5.9
//
// Dev-only Swift package so the motion and session logic builds and tests on a Mac
// with `swift test`, without Xcode or a phone. The app itself compiles these same
// files through the Expo module's podspec; this package is not shipped.
//
// The podspec must exclude Tests/ and Tools/ (they import Testing and run on macOS):
//   s.exclude_files = ["Tests/**", "Tools/**", "Package.swift"]

import PackageDescription
import Foundation

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().path

let package = Package(
    name: "RaveGuardCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "RaveGuardCore", targets: ["RaveGuardCore"]),
        .executable(name: "motion-probe", targets: ["MotionProbe"]),
        .executable(name: "fall-lab", targets: ["FallLab"]),
    ],
    targets: [
        .target(
            name: "RaveGuardCore",
            path: ".",
            exclude: ["Tests", "Tools", "Motion/Fixtures", "Motion/README.md", "Noise/README.md", "Voice/README.md"],
            sources: ["Shared", "Motion", "Noise", "Session", "Escalation", "Module", "Hearing", "Audio", "Voice", "Location"]
        ),
        .testTarget(
            name: "RaveGuardCoreTests",
            dependencies: ["RaveGuardCore"],
            path: "Tests/RaveGuardCoreTests"
        ),
        // J1 on a Mac: prints AirPods head motion. Run live/record through run.sh, which
        // wraps it in an .app so macOS asks for Motion permission instead of killing it.
        .executableTarget(
            name: "MotionProbe",
            dependencies: ["RaveGuardCore"],
            path: "Tools/MotionProbe",
            exclude: ["Info.plist", "run.sh"],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist", "-Xlinker", "\(root)/Tools/MotionProbe/Info.plist",
                ]),
            ]
        ),
        // Fall-model training and evaluation with Create ML (macOS only; fall-model plan).
        .executableTarget(
            name: "FallLab",
            dependencies: ["RaveGuardCore"],
            path: "Tools/FallLab"
        ),
    ]
)
