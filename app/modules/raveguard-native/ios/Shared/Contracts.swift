// Seeded from PRD; path relocated by WORK_ORDER.md. No signature changes.
import Foundation
import Observation

enum MotionState: String, Codable { case dancing, walking, still, fallen, unknown }
enum TriggerKind: String, Codable { case fall, stillness, scheduled, manual }

struct Posture: Codable, Equatable { let pitchDeg: Double; let rollDeg: Double }

struct MotionEvent: Codable, Equatable {
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

enum SessionEventKind: String, Codable {
    case sessionStarted, motionState, trigger, checkInStarted, promptEscalated,
         nod, tapCancel, pinGateOpened, pinSafe, pinDuress, pinWrong,
         escalated, recipientNotified, recipientAcked, resolved,
         airPodsDisconnected, sessionEnded
}
struct SessionEvent: Codable, Identifiable {
    let id: UUID; let at: Date; let kind: SessionEventKind; let detail: String?
}
protocol SessionLogging { func append(_ e: SessionEvent); var events: [SessionEvent] { get } }

enum CheckInStage: String, Codable { case whisper, loud, pinGate }
enum SessionPhase: Equatable {
    case idle, monitoring
    case checkIn(CheckInStage, stageEndsAt: Date)
    case escalated(escalationId: String)
    case sos
}

enum RecipientKind: String, Codable { case contact, venueStaff }
struct PermissionSet: Codable, Equatable {
    var receiveAlerts = true; var seeLocation = false
    var seeFullBrief = false; var canResolve = true
}
struct Contact: Codable, Identifiable, Equatable {
    let id: UUID; var name: String; var phoneE164: String
    var kind: RecipientKind; var order: Int; var permissions: PermissionSet
}

struct GeoPoint: Codable { let lat: Double; let lon: Double; let accuracyM: Double; let at: Date }
struct BriefFacts: Codable {              // Structured brief facts; other API calls also send session metadata.
    let wearerName: String
    let selfDescription: String           // "black hoodie, white cap"
    let lastActiveState: MotionState      // .dancing
    let lastActiveUntil: Date?            // 01:42
    let trigger: MotionEvent
    let promptsUnanswered: Int
    let location: GeoPoint?               // nil until a check-in starts
}

enum CancelMode: String, Codable { case safe, duress }
enum PINResult { case safe, duress, wrong }
protocol PINVerifier { func verify(_ pin: String) -> PINResult }

struct RecipientStatus: Codable { let name: String; let kind: RecipientKind
    let notifiedAt: Date?; let ackedAt: Date? }
struct EscalationStatus: Codable {
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

@MainActor protocol SessionModel: Observable {
    var phase: SessionPhase { get }
    var motionState: MotionState { get }
    var roomDb: Double { get }
    var protectionLevel: Int { get }
    var dosePercent: Double { get }
    var nextCheckIn: Date? { get }
    var escalation: EscalationStatus? { get }
    func start(); func stop(); func tapCancel()
    func submitPIN(_ pin: String) -> Bool  // false only for a wrong PIN
}
