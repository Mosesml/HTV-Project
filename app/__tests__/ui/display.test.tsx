import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Avatar, avatarText } from '../../src/ui/Avatar';
import { Card } from '../../src/ui/Card';
import { IconChip } from '../../src/ui/IconChip';
import { InfoCallout } from '../../src/ui/InfoCallout';
import { ListRow } from '../../src/ui/ListRow';
import { MetricTile } from '../../src/ui/MetricTile';
import { Screen } from '../../src/ui/Screen';
import { SectionLabel } from '../../src/ui/SectionLabel';
import { StatusDot } from '../../src/ui/StatusDot';
import { StatusPill } from '../../src/ui/StatusPill';
import { NO_VALUE } from '../../src/ui/text';
import { PALETTE, RECIPIENT_COLORS } from '../../src/ui/theme';

describe('Screen', () => {
  test('draws its children and footer on the dark background', () => {
    render(
      <Screen testID="screen" footer={<Text>Footer</Text>}>
        <Text>Body</Text>
      </Screen>
    );
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor).toBe(PALETTE.bg);
  });

  test('the SOS background, without scrolling', () => {
    render(
      <Screen testID="screen" tone="sos" scroll={false}>
        <Text>SOS</Text>
      </Screen>
    );
    expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor).toBe(PALETTE.sosBg);
  });
});

describe('Card', () => {
  test('surface with a border, or the sunken fill', () => {
    const { rerender } = render(
      <Card testID="card">
        <Text>Inside</Text>
      </Card>
    );
    expect(StyleSheet.flatten(screen.getByTestId('card').props.style)).toMatchObject({
      backgroundColor: PALETTE.surface,
      borderColor: PALETTE.border,
      borderRadius: 22,
    });
    rerender(
      <Card testID="card" tone="sunken">
        <Text>Inside</Text>
      </Card>
    );
    expect(StyleSheet.flatten(screen.getByTestId('card').props.style).backgroundColor).toBe(PALETTE.surfaceSunken);
  });
});

describe('ListRow', () => {
  test('reads as one element, title then subtitle', () => {
    render(<ListRow icon="clock" title="Check-ins every 30 min" subtitle="Whispered in your ear. Nod to answer." />);
    expect(screen.getByLabelText('Check-ins every 30 min, Whispered in your ear. Nod to answer.')).toBeTruthy();
  });

  test('with onPress it is a button; accessibility actions pass through', () => {
    const onPress = jest.fn();
    const onAction = jest.fn();
    render(
      <ListRow
        title="Maya Chen"
        subtitle="+1 403 555 0142 · Contact"
        leading={<Avatar index={0} />}
        onPress={onPress}
        accessibilityActions={[{ name: 'moveDown', label: 'Move down' }]}
        onAccessibilityAction={onAction}
      />
    );
    const row = screen.getByRole('button', { name: 'Maya Chen, +1 403 555 0142 · Contact' });
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('Avatar', () => {
  test('numbered squares and lettered circles, coloured by position', () => {
    expect(avatarText('number', 0)).toBe('1');
    expect(avatarText('letter', 1, 'theo Park')).toBe('T');
    expect(avatarText('letter', 2, '  ')).toBe('?');
    render(<Avatar index={1} variant="letter" name="Theo" testID="avatar" />);
    expect(StyleSheet.flatten(screen.getByTestId('avatar', { includeHiddenElements: true }).props.style)).toMatchObject({
      backgroundColor: RECIPIENT_COLORS[1].background,
      borderRadius: 16,
    });
  });
});

describe('MetricTile', () => {
  test('a value with its unit, read as one element', () => {
    render(<MetricTile label="Room" value="98" unit="dB" />);
    expect(screen.getByLabelText('Room: 98 dB')).toBeTruthy();
  });

  test('a null reading shows "—" without the unit and says "no reading yet"', () => {
    render(<MetricTile label="In your ears" value={NO_VALUE} unit="dB" />);
    expect(screen.getByLabelText('In your ears: no reading yet')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(' dB')).toBeNull();
  });
});

describe('StatusPill and StatusDot', () => {
  test('the live pill reads its label and detail', () => {
    render(<StatusPill tone="live" label="Session live" detail="1h 42m" />);
    expect(screen.getByLabelText('Session live, 1h 42m')).toBeTruthy();
  });

  test('the alert pill is coral on coral-soft', () => {
    render(<StatusPill tone="alert" label="SOS" testID="pill" />);
    expect(StyleSheet.flatten(screen.getByTestId('pill').props.style).backgroundColor).toBe(PALETTE.coralSoft);
    expect(StyleSheet.flatten(screen.getByText('SOS').props.style).color).toBe(PALETTE.coral);
  });

  test('a dot is decorative', () => {
    render(<StatusDot tone="ok" />);
    expect(screen.queryByTestId('status-dot-ok')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('status-dot-ok', { includeHiddenElements: true }).props.style).backgroundColor).toBe(PALETTE.mint);
  });
});

describe('InfoCallout, SectionLabel, IconChip', () => {
  test('a callout with a title', () => {
    render(<InfoCallout title="What Theo would get">"Alex missed a safety check-in at 01:44."</InfoCallout>);
    expect(screen.getByText('What Theo would get')).toBeTruthy();
    expect(screen.getByText('"Alex missed a safety check-in at 01:44."')).toBeTruthy();
  });

  test('a section label is a header', () => {
    render(<SectionLabel>Right now</SectionLabel>);
    expect(screen.getByRole('header', { name: 'Right now' })).toBeTruthy();
  });

  test('an icon chip is decorative', () => {
    render(<IconChip icon="headphones" color={PALETTE.blue} />);
    expect(screen.queryByTestId('icon-headphones')).toBeNull();
  });
});
