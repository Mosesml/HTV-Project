// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RaveGuardSession",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "RaveGuardSession", targets: ["RaveGuardSession"])],
    targets: [
        .target(name: "RaveGuardSession", path: "RaveGuard/Session"),
        .testTarget(name: "RaveGuardSessionTests", dependencies: ["RaveGuardSession"],
                    path: "RaveGuard/RaveGuardTests/C")
    ]
)
