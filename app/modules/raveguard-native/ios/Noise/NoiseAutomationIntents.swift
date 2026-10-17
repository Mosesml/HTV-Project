#if os(iOS) && canImport(AppIntents)
import AppIntents
import Foundation

public struct RaveGuardNoiseIntentsPackage: AppIntentsPackage {}

public struct BeginNoiseRelayIntent: AppIntent {
    public static let title: LocalizedStringResource = "Begin RaveGuard Noise Relay"
    public static let openAppWhenRun = false
    public init() {}

    @MainActor
    public func perform() async throws -> some IntentResult & ReturnsValue<String> {
        .result(value: NoiseAutomationAccess.controller?.beginRelay() ?? "")
    }
}

public struct NextNoiseCommandIntent: AppIntent {
    public static let title: LocalizedStringResource = "Get RaveGuard Noise Command"
    public static let openAppWhenRun = false
    @Parameter(title: "Relay") public var relay: String
    public init() {}

    @MainActor
    public func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let command = NoiseAutomationAccess.controller?.next(runner: relay)
            ?? NoiseAutomationController.Command(action: "stop", request: "")
        return .result(value: String(decoding: try JSONEncoder().encode(command), as: UTF8.self))
    }
}

public struct AcknowledgeNoiseCommandIntent: AppIntent {
    public static let title: LocalizedStringResource = "Confirm RaveGuard Noise Command"
    public static let openAppWhenRun = false
    @Parameter(title: "Relay") public var relay: String
    @Parameter(title: "Request") public var request: String
    public init() {}

    @MainActor
    public func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        .result(value: NoiseAutomationAccess.controller?.acknowledge(runner: relay, request: request) ?? false)
    }
}
#endif
