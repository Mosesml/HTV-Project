import ExpoModulesCore

/// Expo glue for the RaveGuard module (K2). Deliberately thin: every function runs on the main
/// queue, where the session lives, and hands straight to `RaveGuardRuntime`; every runtime
/// event goes out through `sendEvent`. The API is WORK_ORDER.md's seam table, mirrored in
/// src/RaveGuardNative.types.ts. Anything with logic belongs in Module/, where `swift test`
/// reaches it.
public class RaveGuardModule: Module {
  private var runtime: RaveGuardRuntime?

  public func definition() -> ModuleDefinition {
    Name("RaveGuardNative")

    Events(RaveGuardRuntime.Event.allCases.map(\.rawValue))

    OnDestroy {
      let runtime = self.runtime
      DispatchQueue.main.async { MainActor.assumeIsolated { runtime?.shutdown() } }
    }

    AsyncFunction("configure") { (settings: [String: Any]) in
      try self.onMain { try $0.configure(settings) }
    }.runOnQueue(.main)

    AsyncFunction("startSession") { () in
      self.onMain { $0.startSession() }
    }.runOnQueue(.main)

    AsyncFunction("stopSession") { () -> Bool in
      var stopped = false
      self.onMain { stopped = $0.stopSession() }
      return stopped
    }.runOnQueue(.main)

    AsyncFunction("tapCancel") { () in
      self.onMain { $0.tapCancel() }
    }.runOnQueue(.main)

    AsyncFunction("pinResult") { (kind: String) in
      try self.onMain { try $0.pinResult(kind) }
    }.runOnQueue(.main)

    AsyncFunction("setProtectionLevel") { (level: Int) in
      try self.onMain { try $0.setProtectionLevel(level) }
    }.runOnQueue(.main)

    AsyncFunction("setNoiseBackend") { (kind: String) in
      try self.onMain { try $0.setNoiseBackend(kind) }
    }.runOnQueue(.main)

    AsyncFunction("handleNoiseCallbackURL") { (url: String) -> Bool in
      var handled = false
      self.onMain { handled = $0.handleNoiseCallbackURL(url) }
      return handled
    }.runOnQueue(.main)

    AsyncFunction("debugFire") { (scenario: Int) in
      try self.onMain { try $0.debugFire(scenario) }
    }.runOnQueue(.main)

    AsyncFunction("debugSetOffline") { (on: Bool) in
      self.onMain { $0.debugSetOffline(on) }
    }.runOnQueue(.main)

    AsyncFunction("getSnapshot") { () -> [String: Any?] in
      var snapshot: [String: Any?] = [:]
      self.onMain { snapshot = $0.snapshot() }
      return snapshot
    }.runOnQueue(.main)

    AsyncFunction("setProtectionMode") { (mode: String) in
      try self.onMain { try $0.setProtectionMode(mode) }
    }.runOnQueue(.main)
  }

  /// Every function above runs on the main queue, so this only tells the compiler what is
  /// already true. Creates the runtime on first use.
  private func onMain(_ body: @MainActor (RaveGuardRuntime) throws -> Void) rethrows {
    try MainActor.assumeIsolated {
      let runtime = self.runtime ?? self.makeRuntime()
      try body(runtime)
    }
  }

  @MainActor
  private func makeRuntime() -> RaveGuardRuntime {
    let runtime = RaveGuardRuntime.withFakes { [weak self] event, body in
      self?.sendEvent(event.rawValue, body)
    }
    self.runtime = runtime
    return runtime
  }
}
