#!/usr/bin/env python3
"""Execute the synchronous XCTest assertions with Swift CLT when XCTest is absent.

This does not emulate XCTest: no setup/teardown, async tests, discovery or reporting
API. The constrained test shape is checked before generating a standalone runner.
Run `swift test` with full Xcode for the real XCTest suite.
"""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
work = root / 'work/session-core-check'
work.mkdir(parents=True, exist_ok=True)
tests = root / 'RaveGuard/RaveGuardTests/C/CheckInLadderTests.swift'
source = tests.read_text()
names = re.findall(r'^    func (test\w+)\(\) \{', source, re.MULTILINE)
if not names or len(names) != len(re.findall(r'func test\w+', source)):
    raise SystemExit('Unsupported test signature: run with full XCTest.')
if re.search(r'func (setUp|tearDown)|override ', source):
    raise SystemExit('Lifecycle hooks require full XCTest.')
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
func XCTAssertFalse(_ actual: @autoclosure () -> Bool,
    file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(actual(), false, file: file, line: line)
}
@main struct Runner {
    static func main() {
'''
for name in names:
    runner += f'        CheckInLadderTests().{name}()\n'
runner += f'''        print("{len(names)} scenarios, \\(assertions) assertions, \\(failures) failures (standalone Swift runner)")
        if failures > 0 {{ exit(1) }}
    }}
}}
'''
runner_path = work / 'Runner.swift'
runner_path.write_text(runner)
binary = work / 'checks'
subprocess.run(['swiftc', '-DSESSION_CORE_STANDALONE', '-module-cache-path', str(work/'module-cache'),
                *map(str, sorted((root/'RaveGuard/Session').glob('*.swift'))),
                str(tests), str(runner_path), '-o', str(binary)], check=True)
subprocess.run([str(binary)], check=True)
