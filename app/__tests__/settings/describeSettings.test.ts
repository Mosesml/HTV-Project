import { describePermissions } from '../../src/settings/describeSettings';

describe('describePermissions', () => {
  test('lists what the recipient may do, in grid order', () => {
    expect(describePermissions({ receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true })).toBe(
      'Gets alerts, sees location, sees full brief, can resolve'
    );
    expect(describePermissions({ receiveAlerts: false, seeLocation: true, seeFullBrief: false, canResolve: false })).toBe(
      'Sees location'
    );
  });

  test('says so when nothing is granted', () => {
    expect(describePermissions({ receiveAlerts: false, seeLocation: false, seeFullBrief: false, canResolve: false })).toBe(
      'No alerts, nothing shared'
    );
  });
});
