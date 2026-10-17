import Foundation

/// BL1: who sets the protection level. `auto` is the level loop, `manual` the slider (HRG-5).
enum ProtectionMode: String, CaseIterable, Sendable { case auto, manual }
