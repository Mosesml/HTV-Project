import Foundation

/// Typed reads from a JavaScript object, with the field's path ("settings.recipients[0].name")
/// in every error. JavaScript `null` and a missing key both count as absent.
struct ModuleFields {
    let raw: [String: Any]
    let path: String

    init(_ raw: [String: Any], path: String) {
        self.raw = raw
        self.path = path
    }

    func field(_ key: String) -> String { "\(path).\(key)" }

    func invalid(_ key: String, _ reason: String) -> ModuleError {
        .invalid(field: field(key), reason: reason)
    }

    func string(_ key: String) throws -> String {
        guard let s = try value(key) as? String else { throw invalid(key, "must be a string") }
        return s
    }

    /// A string that may be missing or null, which reads as `fallback`.
    func optionalString(_ key: String, default fallback: String) throws -> String {
        guard let v = optionalValue(key) else { return fallback }
        guard let s = v as? String else { throw invalid(key, "must be a string") }
        return s
    }

    func nonBlankString(_ key: String) throws -> String {
        let s = try string(key)
        guard !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw invalid(key, "must not be blank")
        }
        return s
    }

    func bool(_ key: String) throws -> Bool {
        guard let b = Self.boolean(try value(key)) else { throw invalid(key, "must be a boolean") }
        return b
    }

    func optionalBool(_ key: String, default fallback: Bool) throws -> Bool {
        guard let v = optionalValue(key) else { return fallback }
        guard let b = Self.boolean(v) else { throw invalid(key, "must be a boolean") }
        return b
    }

    func number(_ key: String) throws -> Double {
        guard let n = Self.number(try value(key)), n.isFinite else { throw invalid(key, "must be a number") }
        return n
    }

    func int(_ key: String) throws -> Int {
        let n = try number(key)
        guard n.rounded() == n, abs(n) <= Double(Int32.max) else { throw invalid(key, "must be a whole number") }
        return Int(n)
    }

    func array(_ key: String) throws -> [Any] {
        guard let a = try value(key) as? [Any] else { throw invalid(key, "must be an array") }
        return a
    }

    func object(_ key: String) throws -> ModuleFields {
        guard let d = try value(key) as? [String: Any] else { throw invalid(key, "must be an object") }
        return ModuleFields(d, path: field(key))
    }

    func phone(_ key: String) throws -> String {
        let s = try string(key)
        guard s.range(of: #"^\+[1-9][0-9]{7,14}$"#, options: .regularExpression) != nil else {
            throw invalid(key, "must be an E.164 phone number like +14165550123 (got \(s))")
        }
        return s
    }

    func optionalPhone(_ key: String) throws -> String? {
        optionalValue(key) == nil ? nil : try phone(key)
    }

    func optionalHTTPURL(_ key: String) throws -> URL? {
        guard let v = optionalValue(key) else { return nil }
        guard let s = v as? String, let url = URL(string: s),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil else {
            throw invalid(key, "must be an http or https URL")
        }
        return url
    }

    // MARK: JavaScript values

    private func value(_ key: String) throws -> Any {
        guard let v = optionalValue(key) else { throw ModuleError.missing(field: field(key)) }
        return v
    }

    private func optionalValue(_ key: String) -> Any? {
        guard let v = raw[key], !(v is NSNull) else { return nil }
        return v
    }

    /// A Swift `Bool`, or an `NSNumber` that is really a boolean (how JavaScript `true` can arrive).
    static func boolean(_ v: Any) -> Bool? {
        if type(of: v) == Bool.self { return v as? Bool }
        if let n = v as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue }
        return nil
    }

    /// A Swift `Int` or `Double`, or a numeric `NSNumber`. Booleans are not numbers here.
    static func number(_ v: Any) -> Double? {
        if boolean(v) != nil { return nil }
        if type(of: v) == Double.self { return v as? Double }
        if type(of: v) == Int.self { return (v as? Int).map(Double.init) }
        return (v as? NSNumber)?.doubleValue
    }
}
