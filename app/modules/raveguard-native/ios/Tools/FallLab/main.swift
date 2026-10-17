// fall-lab: trains and evaluates the couch-fall model (docs/fall-model-plan.md, steps 6, 8, 9).
//
//   swift run fall-lab                         # defaults below; run from this package's folder
//   swift run fall-lab --real <dir> --generated <dir> --out <dir>
//   swift run fall-lab compare                 # step 9: thresholds vs retuned vs model (Compare.swift)
//
// Every candidate (head past 45°) in every take becomes one row of FallFeatures. Leave one
// fold out, five times: train on every take outside the fold, test on the fold's REAL takes
// (plus its synthetic dancing, the only negatives that reach 45° until real ones are
// recorded). Then train on everything and write FallModel.mlmodel and features.csv.
// macOS only: Create ML does not exist on iOS, so this never ships in the app.

import CoreML
import CreateML
import Foundation
import RaveGuardCore
import TabularData

let folds = 5
let cutOff = 0.5
let target = "outcome"

struct Take {
    let name: String
    let label: String
    let source: String     // real | augmented | synthetic
    let fold: Int
    let samples: [MotionSample]
}

struct Row {
    let take: Take
    let isFall: Bool
    let features: [Double]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func option(_ name: String, _ fallback: String) -> String {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return fallback }
    return args[i + 1]
}

/// Real takes 01–10 → folds 0–4, the same rule as ml/augment (one side and one back fall each).
func foldFromName(_ name: String) -> Int {
    let stem = (name as NSString).deletingPathExtension
    let number = Int(stem.split(separator: "_").last?.prefix(2) ?? "") ?? 1
    return (number - 1) % folds
}

func loadTakes(_ dir: String) -> [Take] {
    let url = URL(fileURLWithPath: dir)
    guard let files = try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
    else { fail("No folder at \(dir)") }
    return files.filter { $0.pathExtension == "csv" }.sorted { $0.path < $1.path }.compactMap { file in
        guard let text = try? String(contentsOf: file, encoding: .utf8),
              let take = try? MotionCSV.decode(text) else {
            print("skipped unreadable \(file.lastPathComponent)")
            return nil
        }
        let name = file.lastPathComponent
        return Take(name: name,
                    label: take.meta["label"] ?? MotionCSV.label(fromFilename: name) ?? "unknown",
                    source: take.meta["source"] ?? "real",
                    fold: take.meta["fold"].flatMap(Int.init) ?? foldFromName(name),
                    samples: take.samples)
    }
}

/// In a fall take the first candidate is the fall; every other candidate is not.
func rows(_ takes: [Take]) -> [Row] {
    takes.flatMap { take in
        FallFeatures.candidates(in: take.samples).enumerated().map { i, c in
            Row(take: take, isFall: take.label == "fall" && i == 0, features: c.features)
        }
    }
}

func frame(_ rows: [Row]) -> DataFrame {
    var df = DataFrame()
    for (k, name) in FallFeatures.names.enumerated() {
        df.append(column: Column(name: name, contents: rows.map { $0.features[k] }))
    }
    df.append(column: Column(name: target, contents: rows.map { $0.isFall ? "fall" : "other" }))
    return df
}

func train(_ rows: [Row]) throws -> MLBoostedTreeClassifier {
    let parameters = MLBoostedTreeClassifier.ModelParameters(
        validation: .none, maxDepth: 4, maxIterations: 100, randomSeed: 7)
    return try MLBoostedTreeClassifier(trainingData: frame(rows), targetColumn: target,
                                       featureColumns: FallFeatures.names, parameters: parameters)
}

func fallProbability(_ model: MLModel, _ features: [Double]) throws -> Double {
    let input = try MLDictionaryFeatureProvider(dictionary:
        Dictionary(uniqueKeysWithValues: zip(FallFeatures.names, features.map { NSNumber(value: $0) })))
    let output = try model.prediction(from: input)
    let probs = output.featureValue(for: target + "Probability")?.dictionaryValue ?? [:]
    return probs["fall"]?.doubleValue ?? 0
}

// MARK: - Run

func count(_ rs: [Row], _ where_: (Row) -> Bool) -> Int { rs.filter(where_).count }

let realDir = option("--real", "Motion/Fixtures/couch-baseline")
let generatedDir = option("--generated", "Motion/Fixtures/couch-augmented")
let outDir = URL(fileURLWithPath: option("--out", ".build/fall-lab"))

let takes = loadTakes(realDir) + loadTakes(generatedDir)
let all = rows(takes)

/// `swift run fall-lab`: leave-one-fold-out check of the model, then train the final model.
func runTrain(_ takes: [Take], _ all: [Row], outDir: URL) throws {
    print("Takes: \(takes.count) (\(count(all) { _ in true }) candidates: "
          + "\(count(all) { $0.isFall }) falls, \(count(all) { !$0.isFall }) not falls)")
    for source in ["real", "augmented", "synthetic"] {
        let rs = all.filter { $0.take.source == source }
        print(String(format: "  %-9@ %3d takes, %3d fall candidates, %3d other candidates",
                     source as NSString, takes.filter { $0.source == source }.count,
                     count(rs) { $0.isFall }, count(rs) { !$0.isFall }))
    }
    let sitTakes = takes.filter { $0.label == "sitdown" }
    print("  sit-downs reaching 45° (so the model ever sees them): \(sitTakes.filter { !FallFeatures.candidates(in: $0.samples).isEmpty }.count) of \(sitTakes.count)")

    print("\nLeave one fold out (test = held-out REAL falls and sit-downs, plus held-out synthetic dancing)")
    print("fold  real falls caught  real sit-downs fired  dancing candidates flagged")
    var caught = 0, realFalls = 0, sitFired = 0, danceFlagged = 0, danceTotal = 0
    var missed: [String] = []
    for k in 0..<folds {
        let model = try train(all.filter { $0.take.fold != k }).model
        let test = takes.filter { $0.fold == k && ($0.source == "real" || $0.source == "synthetic") }
        var fallsHere = 0, caughtHere = 0, sitsHere = 0, danceHere = 0, danceFlagHere = 0
        for take in test {
            let probs = try FallFeatures.candidates(in: take.samples).map { try fallProbability(model, $0.features) }
            let fired = probs.contains { $0 >= cutOff }
            switch take.label {
            case "fall":
                fallsHere += 1
                if fired { caughtHere += 1 } else { missed.append("\(take.name) (p=\(String(format: "%.2f", probs.max() ?? 0)))") }
            case "sitdown": if fired { sitsHere += 1 }
            case "dancing":
                danceHere += probs.count
                danceFlagHere += probs.filter { $0 >= cutOff }.count
            default: break
            }
        }
        print(String(format: "  %d   %d of %d               %d                     %d of %d",
                     k, caughtHere, fallsHere, sitsHere, danceFlagHere, danceHere))
        caught += caughtHere; realFalls += fallsHere; sitFired += sitsHere
        danceFlagged += danceFlagHere; danceTotal += danceHere
    }
    print("total %@".replacingOccurrences(of: "%@", with:
          "\(caught) of \(realFalls) real falls caught, \(sitFired) real sit-downs fired, "
          + "\(danceFlagged) of \(danceTotal) dancing candidates flagged as falls"))
    if !missed.isEmpty { print("missed: " + missed.joined(separator: ", ")) }
    print("(Today's thresholds catch 3 of 10 of these real falls. The model only flags a moment; the")
    print(" app still needs 10 s of stillness after it before anything fires.)")

    try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    let final = try train(all)
    let modelURL = outDir.appendingPathComponent("FallModel.mlmodel")
    try final.write(to: modelURL, metadata: MLModelMetadata(
        author: "RaveGuard", shortDescription:
            "Couch-fall candidate classifier. Trained on 10 real falls and 5 sit-downs from one person, "
            + "augmented, plus synthetic dancing. Not validated on other people.",
        version: "0.1"))
    try frame(all).writeCSV(to: outDir.appendingPathComponent("features.csv"))
    let size = (try? FileManager.default.attributesOfItem(atPath: modelURL.path)[.size] as? Int) ?? 0
    print("\nFinal model (all folds): \(modelURL.path), \(size / 1024) KB")
    print("Features: \(outDir.appendingPathComponent("features.csv").path)")
}

if CommandLine.arguments.dropFirst().first == "compare" {
    try runCompare(takes, all)
} else {
    try runTrain(takes, all, outDir: outDir)
}
