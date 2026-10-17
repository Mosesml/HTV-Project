Pod::Spec.new do |s|
  s.name           = 'RaveGuardNative'
  s.version        = '1.0.0'
  s.summary        = 'RaveGuard session, motion, escalation and noise core'
  s.description    = 'Swift side of the raveguard-native Expo module: the check-in session and everything it drives.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # iOS 17 like Justin's Package.swift; the app's deployment target is raised to match in app.json.
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
  # Package.swift, Tests/ and Tools/ are the dev-only Swift package (swift test, motion-probe):
  # they import Testing or run on macOS, so they must never reach the app build. `swift test`
  # also leaves generated Swift in .build/ (git-ignored, but on disk). Note the `/**/*`:
  # CocoaPods globs like Ruby, where a trailing `**` matches only a folder's direct children.
  s.exclude_files = ['Tests/**/*', 'Tools/**/*', 'Package.swift', '.build/**/*', '.swiftpm/**/*']
end
