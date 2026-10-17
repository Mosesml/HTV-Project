// swift-tools-version: 5.9
import PackageDescription

// Test harness only. Expo compiles the Swift source files into its native module.
let package = Package(
    name: "RaveGuardEscalation",
    platforms: [.iOS(.v17), .macOS(.v14)],
    targets: [
        .target(name: "RaveGuardEscalation", path: "app/modules/raveguard-native/ios",
                sources: ["Shared/Contracts.swift", "Escalation/FakeEscalationService.swift"]),
        .testTarget(name: "RaveGuardEscalationTests", dependencies: ["RaveGuardEscalation"],
                    path: "tests/Escalation")
    ]
)
