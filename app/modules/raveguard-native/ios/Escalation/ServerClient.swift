import CryptoKit
import Foundation

/// HTTP seam: `URLSessionTransport` in the app, a scripted stub in tests.
protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Ephemeral session: no cookies, no cache, no credential storage. Short timeouts keep a dead
/// network from stalling the heartbeat or a cancel retry for more than a few seconds.
struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    init(session: URLSession = URLSessionTransport.makeSession()) { self.session = session }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }
}

/// What a caller can act on. Cases carry only status codes and the server's fixed error
/// codes, so a description never contains a token, phone number or request body.
enum ServerClientError: Error, Equatable, CustomStringConvertible {
    case insecureURL
    case noSession
    case alreadyStarted
    /// 401: the session is unknown to the server or its token no longer matches.
    case unauthorized
    case notFound
    /// Any other 4xx the server will not accept on retry; `code` is the server's `error.code`.
    case rejected(code: String)
    /// 429 or 5xx: worth retrying.
    case server(status: Int)
    /// No usable HTTP response: offline, timeout, TLS failure.
    case transport
    /// A 2xx whose body is not the documented envelope.
    case invalidResponse

    var isTransient: Bool {
        switch self {
        case .server, .transport: return true
        default: return false
        }
    }

    var description: String {
        switch self {
        case .insecureURL: return "ServerClientError.insecureURL"
        case .noSession: return "ServerClientError.noSession"
        case .alreadyStarted: return "ServerClientError.alreadyStarted"
        case .unauthorized: return "ServerClientError.unauthorized"
        case .notFound: return "ServerClientError.notFound"
        case .rejected(let code): return "ServerClientError.rejected(\(code))"
        case .server(let status): return "ServerClientError.server(\(status))"
        case .transport: return "ServerClientError.transport"
        case .invalidResponse: return "ServerClientError.invalidResponse"
        }
    }
}

/// The phone side of the escalation server (PRD "Server API"), as an `EscalationService`.
///
/// - The bearer token from `startSession` lives only in memory and goes only to `baseURL`,
///   which must be HTTPS (loopback may use HTTP for local testing).
/// - It sends its own 10 s heartbeat so the server's silence window never depends on the
///   session's timers. `heartbeat()` is the session's nudge: it sends unless one went out
///   within half an interval, so the two sources never double up.
/// - `cancel` keeps retrying network and server failures until the server accepts it, because
///   a cancel that never lands is a false alarm (ESC-2). It stops on a permanent rejection or
///   when the session ends. Every other call is a single attempt; `SessionManager` retries those.
/// - `register` carries a derived `Idempotency-Key`, so the session's retry of a register whose
///   response was lost gets the original escalation back.
/// - Nothing is logged.
actor ServerClient: EscalationService {
    struct Timing: Sendable {
        var heartbeatInterval: TimeInterval = 10
        var cancelRetryInitial: TimeInterval = 0.5
        var cancelRetryMax: TimeInterval = 5
        /// Attempts at the DELETE in `endSession` before it gives up and throws.
        var endSessionAttempts = 3
    }

    typealias Sleep = @Sendable (TimeInterval) async throws -> Void

    static let systemSleep: Sleep = { seconds in
        try await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
    }

    private let apiRoot: URL
    private let transport: HTTPTransport
    private let timing: Timing
    private let sleep: Sleep
    private let now: @Sendable () -> Date
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private var session: (id: String, token: String)?
    private var starting = false
    private var heartbeatTask: Task<Void, Never>?
    private var lastHeartbeatAt: Date?
    private var cancelModes: [String: CancelMode] = [:]
    private var cancelTasks: [String: Task<Void, Error>] = [:]
    private var duressLanded: Set<String> = []

    /// - Parameter baseURL: the server origin, e.g. `https://raveguard.example.com`.
    init(baseURL: URL,
         transport: HTTPTransport = URLSessionTransport(),
         timing: Timing = Timing(),
         sleep: @escaping Sleep = ServerClient.systemSleep,
         now: @escaping @Sendable () -> Date = { Date() }) throws {
        guard let scheme = baseURL.scheme?.lowercased(), let host = baseURL.host?.lowercased(),
              scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host))
        else { throw ServerClientError.insecureURL }
        apiRoot = baseURL.appendingPathComponent("v1")
        self.transport = transport
        self.timing = timing
        self.sleep = sleep
        self.now = now
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
        }
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return date }
            if let date = try? Date(text, strategy: Date.ISO8601FormatStyle()) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                    debugDescription: "Not an ISO 8601 date"))
        }
    }

    // MARK: EscalationService

    func startSession(wearerName: String, selfDescription: String,
                      recipients: [Contact], demo: Bool) async throws {
        guard session == nil, !starting else { throw ServerClientError.alreadyStarted }
        starting = true
        defer { starting = false }
        let created: SessionCreated = try await request(
            "POST", ["sessions"], token: nil,
            body: try encode(SessionBody(wearerName: wearerName, selfDescription: selfDescription,
                                         recipients: recipients, demo: demo)))
        session = (created.sessionId, created.token)
        lastHeartbeatAt = now()   // creating the session counts as the first heartbeat
        startHeartbeatLoop()
    }

    func heartbeat() async {
        _ = await sendHeartbeat()
    }

    func register(deadline: Date, facts: BriefFacts) async throws -> String {
        let session = try requireSession()
        let created: EscalationCreated = try await request(
            "POST", ["sessions", session.id, "escalations"], token: session.token,
            body: try encode(RegisterBody(deadline: deadline, facts: facts)),
            idempotencyKey: Self.registrationKey(sessionID: session.id, deadline: deadline, trigger: facts.trigger))
        return created.escalationId
    }

    /// `SessionManager` retries a failed register with the same deadline and facts, and cannot tell
    /// whether the first attempt landed. A key derived from the check-in's identity lets the server
    /// return the original escalation instead of creating a second one that the phone never
    /// learns the id of, so could never cancel. Millisecond precision matches the wire format.
    static func registrationKey(sessionID: String, deadline: Date, trigger: MotionEvent) -> String {
        func millis(_ date: Date) -> Int64 { Int64((date.timeIntervalSince1970 * 1000).rounded()) }
        let identity = "\(sessionID)|\(millis(deadline))|\(trigger.kind.rawValue)|\(millis(trigger.at))"
        return SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func update(_ escalationId: String, facts: BriefFacts) async throws {
        let session = try requireSession()
        try await send("PATCH", ["escalations", try validated(escalationId)], token: session.token,
                       body: try encode(FactsBody(facts: facts)))
    }

    func cancel(_ escalationId: String, mode: CancelMode) async throws {
        let session = try requireSession()
        let id = try validated(escalationId)
        // A safe cancel after a duress one would close the escalation the duress just fired.
        if mode == .safe, duressLanded.contains(id) { return }
        if let pending = cancelTasks[id] {
            if mode == .duress { cancelModes[id] = .duress }   // duress outranks a queued safe
            return try await pending.value
        }
        cancelModes[id] = mode
        let task = Task { try await self.deliverCancel(id, sessionID: session.id) }
        cancelTasks[id] = task
        try await task.value
    }

    func fireNow(_ escalationId: String) async throws {
        let session = try requireSession()
        try await send("POST", ["escalations", try validated(escalationId), "fire"], token: session.token,
                       body: try encode(FireBody(reason: "Fired by the phone")))
    }

    func status(_ escalationId: String) async throws -> EscalationStatus {
        let session = try requireSession()
        return try await request("GET", ["escalations", try validated(escalationId)], token: session.token)
    }

    /// Stops the heartbeat and any cancel retry, then deletes the server record (SES-8).
    /// A session the server no longer knows counts as already deleted.
    func endSession() async throws {
        guard let ended = session else { return }
        session = nil
        lastHeartbeatAt = nil
        heartbeatTask?.cancel(); heartbeatTask = nil
        cancelTasks.values.forEach { $0.cancel() }
        cancelTasks = [:]; cancelModes = [:]; duressLanded = []
        var delay = timing.cancelRetryInitial
        for attempt in 1...max(1, timing.endSessionAttempts) {
            do {
                try await send("DELETE", ["sessions", ended.id], token: ended.token)
                return
            } catch ServerClientError.unauthorized {
                return
            } catch let error as ServerClientError where error.isTransient && attempt < timing.endSessionAttempts {
                try await sleep(delay)
                delay = min(delay * 2, timing.cancelRetryMax)
            }
        }
    }

    // MARK: Heartbeat

    private func startHeartbeatLoop() {
        heartbeatTask?.cancel()
        let interval = timing.heartbeatInterval
        let sleep = self.sleep
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await sleep(interval) } catch { return }
                guard let self, await self.sendHeartbeat() else { return }
            }
        }
    }

    /// Returns false when the loop should stop: the session ended or the server forgot it.
    /// A failed beat is not retried early; the next tick is at most one interval away, and a
    /// silent phone never stops a pending escalation (ESC-4).
    private func sendHeartbeat() async -> Bool {
        guard let current = session else { return false }
        let at = now()
        if let last = lastHeartbeatAt, at.timeIntervalSince(last) < timing.heartbeatInterval / 2 { return true }
        lastHeartbeatAt = at
        do {
            try await send("POST", ["sessions", current.id, "heartbeat"], token: current.token)
        } catch ServerClientError.unauthorized, ServerClientError.notFound {
            return false
        } catch {}
        return session?.id == current.id
    }

    // MARK: Cancel delivery

    private func deliverCancel(_ id: String, sessionID: String) async throws {
        defer { cancelModes[id] = nil; cancelTasks[id] = nil }
        var delay = timing.cancelRetryInitial
        while true {
            guard session?.id == sessionID, let current = session, let mode = cancelModes[id] else {
                throw ServerClientError.noSession
            }
            do {
                try await send("POST", ["escalations", id, "cancel"], token: current.token,
                               body: try encode(CancelBody(mode: mode)))
                if mode == .duress { duressLanded.insert(id) }
                return
            } catch let error as ServerClientError where error.isTransient {
                try await sleep(delay)
                delay = min(delay * 2, timing.cancelRetryMax)
            }
        }
    }

    // MARK: Requests

    private func requireSession() throws -> (id: String, token: String) {
        guard let session else { throw ServerClientError.noSession }
        return session
    }

    /// Ids come from the server, but they go into a URL path, so refuse anything else.
    private func validated(_ id: String) throws -> String {
        guard !id.isEmpty, id.utf8.allSatisfy({ byte in
            (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5A)
                || (byte >= 0x61 && byte <= 0x7A) || byte == 0x2D
        }) else { throw ServerClientError.rejected(code: "INVALID_ID") }
        return id
    }

    private func encode<Body: Encodable>(_ body: Body) throws -> Data {
        do { return try encoder.encode(body) }
        catch { throw ServerClientError.rejected(code: "UNENCODABLE") }   // e.g. a NaN coordinate
    }

    private func send(_ method: String, _ path: [String], token: String?, body: Data? = nil) async throws {
        _ = try await perform(method, path, token: token, body: body)
    }

    private func request<Output: Decodable>(_ method: String, _ path: [String], token: String?,
                                            body: Data? = nil, idempotencyKey: String? = nil) async throws -> Output {
        let data = try await perform(method, path, token: token, body: body, idempotencyKey: idempotencyKey)
        guard let envelope = try? decoder.decode(Envelope<Output>.self, from: data),
              envelope.ok, let output = envelope.data else { throw ServerClientError.invalidResponse }
        return output
    }

    private func perform(_ method: String, _ path: [String], token: String?, body: Data?,
                         idempotencyKey: String? = nil) async throws -> Data {
        var url = apiRoot
        path.forEach { url.appendPathComponent($0) }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let idempotencyKey { urlRequest.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }
        let data: Data, http: HTTPURLResponse
        do {
            (data, http) = try await transport.send(urlRequest)
        } catch {
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                throw CancellationError()
            }
            throw ServerClientError.transport
        }
        switch http.statusCode {
        case 200..<300: return data
        case 401: throw ServerClientError.unauthorized
        case 404: throw ServerClientError.notFound
        case 429, 500..<600: throw ServerClientError.server(status: http.statusCode)
        default:
            let code = (try? decoder.decode(ErrorEnvelope.self, from: data))?.error?.code
            throw ServerClientError.rejected(code: code ?? "HTTP_\(http.statusCode)")
        }
    }
}

// MARK: Wire types (exactly the fields the server's strict schemas accept)

private struct SessionBody: Encodable {
    let wearerName: String, selfDescription: String, recipients: [Contact], demo: Bool
}
private struct RegisterBody: Encodable { let deadline: Date, facts: BriefFacts }
private struct FactsBody: Encodable { let facts: BriefFacts }
private struct CancelBody: Encodable { let mode: CancelMode }
private struct FireBody: Encodable { let reason: String }
private struct SessionCreated: Decodable { let sessionId: String, token: String }
private struct EscalationCreated: Decodable { let escalationId: String }
private struct Envelope<Output: Decodable>: Decodable { let ok: Bool; let data: Output? }
private struct ErrorEnvelope: Decodable {
    struct Detail: Decodable { let code: String }
    let error: Detail?
}
