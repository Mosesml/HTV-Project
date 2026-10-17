import CoreML
import Foundation

/// The couch-fall model (fall-model plan steps 8 and 10). `FallModelData` embeds it as
/// base64, written by `swift run fall-lab --install`, so the app and `swift test` load the
/// same bytes with no resource bundle. It is compiled on first use (a few milliseconds for
/// a small tree model). Nil, with a log line, if it can't load or its inputs don't match
/// `FallFeatures`: the app then keeps the threshold detector.
enum FallModel {
    /// The probability that makes a candidate a fall; the cut-off fall-lab evaluated.
    static let cutOff = 0.5
    /// Must match fall-lab's `target` column.
    static let target = "outcome"

    /// Loaded once per process.
    static let shared: FallModelClassifier? = load()

    static func load() -> FallModelClassifier? {
        do {
            guard let data = Data(base64Encoded: FallModelData.base64, options: .ignoreUnknownCharacters) else {
                throw CocoaError(.fileReadCorruptFile)
            }
            let dir = FileManager.default.temporaryDirectory
                .appendingPathComponent("raveguard-fall-model-\(FallModelData.version)", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let source = dir.appendingPathComponent("FallModel.mlmodel")
            try data.write(to: source, options: .atomic)
            let model = try MLModel(contentsOf: try MLModel.compileModel(at: source))
            let inputs = Set(model.modelDescription.inputDescriptionsByName.keys)
            guard inputs == Set(FallFeatures.names) else {
                NSLog("RaveGuard fall: model inputs don't match FallFeatures, using thresholds")
                return nil
            }
            NSLog("RaveGuard fall: model %@ loaded", FallModelData.version)
            return FallModelClassifier(model: model)
        } catch {
            NSLog("RaveGuard fall: model unavailable (%@), using thresholds", String(describing: error))
            return nil
        }
    }
}

/// Wraps the compiled model: features in `FallFeatures.names` order in, P(fall) out.
final class FallModelClassifier: @unchecked Sendable {
    private let model: MLModel

    init(model: MLModel) { self.model = model }

    /// Nil if the prediction fails; the candidate is then dropped, never treated as a fall.
    func probability(_ features: [Double]) -> Double? {
        guard features.count == FallFeatures.names.count,
              let input = try? MLDictionaryFeatureProvider(dictionary: Dictionary(
                uniqueKeysWithValues: zip(FallFeatures.names, features.map { NSNumber(value: $0) }))),
              let output = try? model.prediction(from: input) else { return nil }
        return output.featureValue(for: FallModel.target + "Probability")?.dictionaryValue["fall"]?.doubleValue
    }
}
