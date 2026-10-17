#!/usr/bin/env python3
"""Run the same synchronous assertions/async test methods with Swift CLT.
Not an XCTest replacement: only the constrained methods in this suite are supported.
Use swift test on a Mac with full Xcode for XCTest discovery and reporting.
"""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
work = root / 'work/escalation-check'
work.mkdir(parents=True, exist_ok=True)
tests = root / 'tests/Escalation/FakeEscalationServiceTests.swift'
source = tests.read_text()
names = re.findall(r'^    func (test\w+)\(\) async throws \{', source, re.MULTILINE)
if not names or len(names) != len(re.findall(r'func test\w+', source)):
    raise SystemExit('Unsupported test signature; use XCTest.')
if re.search(r'func (setUp|tearDown)|override ', source):
    raise SystemExit('Lifecycle hooks require XCTest.')
runner = '''import Foundation
class XCTestCase {}
var failures = 0
var assertions = 0
func XCTAssertEqual<T: Equatable>(_ actual: @autoclosure () -> T,
    _ expected: @autoclosure () -> T, file: StaticString = #filePath, line: UInt = #line) {
    assertions += 1
    let a = actual(), e = expected()
    if a != e { failures += 1; print("FAIL \\(file):\\(line): \\(a) != \\(e)") }
}
func XCTFail(_ message: String, file: StaticString = #filePath, line: UInt = #line) {
    failures += 1; print("FAIL \\(file):\\(line): \\(message)")
}
@main struct Runner {
    static func main() async {
'''
for name in names:
    runner += f'        do {{ try await FakeEscalationServiceTests().{name}() }} catch {{ XCTFail("{name}: \\(error)") }}\n'
runner += f'''        print("{len(names)} scenarios, \\(assertions) assertions, \\(failures) failures (standalone Swift runner)")
        if failures > 0 {{ exit(1) }}
    }}
}}
'''
runner_path = work / 'Runner.swift'; runner_path.write_text(runner)
native = root / 'app/modules/raveguard-native/ios'
binary = work / 'checks'
subprocess.run(['swiftc', '-swift-version', '5', '-DESCALATION_STANDALONE', '-module-cache-path', str(root/'work/swift-module-cache'),
                str(native/'Shared/Contracts.swift'), str(native/'Escalation/FakeEscalationService.swift'),
                str(tests), str(runner_path), '-o', str(binary)], check=True)
subprocess.run([str(binary)], check=True)
