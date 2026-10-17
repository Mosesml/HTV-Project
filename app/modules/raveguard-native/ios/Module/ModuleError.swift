import Foundation

/// A bad argument from JavaScript. The message names the field, so the JavaScript promise
/// rejects with something a teammate can act on.
enum ModuleError: Error, Equatable, LocalizedError {
    case missing(field: String)
    case invalid(field: String, reason: String)

    var errorDescription: String? {
        switch self {
        case let .missing(field): return "\(field) is missing"
        case let .invalid(field, reason): return "\(field) \(reason)"
        }
    }
}
