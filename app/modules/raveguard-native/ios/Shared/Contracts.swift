// Shared contracts from the PRD ("Shared contracts"). Owned by all four, by agreement:
// post `CONTRACT:` in the team channel and get a yes from every owner before changing one.
//
// Differences from the PRD text:
// - `SessionModel` is gone; the Expo module API in WORK_ORDER.md replaces it.
// - A few types gained Equatable/Sendable so tests and async code can use them.

import Foundation

enum MotionState: String, Codable, Sendable { case dancing, walking, still, fallen, unknown }
enum TriggerKind: String, Codable, Sendable { case fall, stillness, scheduled, manual }

struct Posture: Codable, Equatable, Sendable { let pitchDeg: Double; let rollDeg: Double }

struct MotionEvent: Codable, Equatable, Sendable {
    let kind: TriggerKind
    let at: Date
    let reason: String        // "spike 3.1 g, head 70° sideways, still 12 s"
    let posture: Posture?
}

protocol MotionEventSource: AnyObject {
    var states: AsyncStream<MotionState> { get }
    var triggers: AsyncStream<MotionEvent> { get }
    var nods: AsyncStream<Date> { get }
    var airPodsConnected: AsyncStream<Bool> { get }
    func setListeningForNod(_ on: Bool)
    func start() throws
    func stop()
}

enum SessionEventKind: String, Codable, Sendable {
    case sessionStarted, motionState, trigger, checkInStarted, promptEscalated,
         nod, tapCancel, pinGateOpened, pinSafe, pinDuress, pinWrong,
         escalated, recipientNotified, recipientAcked, resolved,
         airPodsDisconnected, sessionEnded
}
struct SessionEvent: Codable, Identifiable, Sendable {
    let id: UUID; let at: Date; let kind: SessionEventKind; let detail: String?
}
protocol SessionLogging { func append(_ e: SessionEvent); var events: [SessionEvent] { get } }

enum CheckInStage: String, Codable, Sendable { case whisper, loud, pinGate }
enum SessionPhase: Equatable, Sendable {
    case idle, monitoring
    case checkIn(CheckInStage, stageEndsAt: Date)
    case escalated(escalationId: String)
    case sos
}

enum RecipientKind: String, Codable, Sendable { case contact, venueStaff }
struct PermissionSet: Codable, Equatable, Sendable {
    var receiveAlerts = true; var seeLocation = false
    var seeFullBrief = false; var canResolve = true
}
struct Contact: Codable, Identifiable, Equatable, Sendable {
    let id: UUID; var name: String; var phoneE164: String
    var kind: RecipientKind; var order: Int; var permissions: PermissionSet
}

struct GeoPoint: Codable, Equatable, Sendable { let lat: Double; let lon: Double; let accuracyM: Double; let at: Date }
struct BriefFacts: Codable, Equatable, Sendable {  // Structured brief facts; other API calls also send session metadata.
    let wearerName: String
    let selfDescription: String           // "black hoodie, white cap"
    let lastActiveState: MotionState      // .dancing
    let lastActiveUntil: Date?            // 01:42
    let trigger: MotionEvent
    let promptsUnanswered: Int
    let location: GeoPoint?               // nil until a check-in starts
}

enum CancelMode: String, Codable, Sendable { case safe, duress }
enum PINResult: String, Sendable { case safe, duress, wrong }
protocol PINVerifier { func verify(_ pin: String) -> PINResult }

struct RecipientStatus: Codable, Equatable, Sendable { let name: String; let kind: RecipientKind
    let notifiedAt: Date?; let ackedAt: Date? }
struct EscalationStatus: Codable, Equatable, Sendable {
    let state: String   // pending | notifying | acknowledged | resolved | cancelled
    let recipients: [RecipientStatus]; let sosOpen: Bool
}

protocol EscalationService {
    func startSession(wearerName: String, selfDescription: String,
                      recipients: [Contact], demo: Bool) async throws
    func heartbeat() async
    func register(deadline: Date, facts: BriefFacts) async throws -> String
    func update(_ escalationId: String, facts: BriefFacts) async throws
    func cancel(_ escalationId: String, mode: CancelMode) async throws
    func fireNow(_ escalationId: String) async throws
    func status(_ escalationId: String) async throws -> EscalationStatus
    func endSession() async throws
}

protocol NoiseController { func apply(level: Int) }   // 0–100
