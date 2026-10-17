import { render, screen } from '@testing-library/react-native';

import { Icon } from '../../src/ui/Icon';
import { ICON_NAMES, ICONS } from '../../src/ui/icons';
import { ICON } from '../../src/ui/theme';

describe('Icon', () => {
  test.each(ICON_NAMES)('%s draws in a 24 viewBox with the 1.8 round stroke', (name) => {
    render(<Icon name={name} />);
    const svg = screen.getByTestId(`icon-${name}`, { includeHiddenElements: true });
    expect(svg.props.vbWidth).toBe(24);
    expect(svg.props.vbHeight).toBe(24);
    expect(svg.props.strokeWidth).toBe(ICON.strokeWidth);
    expect(svg.props.strokeLinecap).toBe('round');
    expect(svg.props.strokeLinejoin).toBe('round');
    expect(ICONS[name].length).toBeGreaterThan(0);
  });

  test('the set uses one stroke width and viewBox', () => {
    expect(ICON.strokeWidth).toBe(1.8);
    expect(ICON.viewBox).toBe(24);
  });

  test('takes a size and a colour', () => {
    render(<Icon name="check" size={18} color="#A6EBCF" />);
    const svg = screen.getByTestId('icon-check', { includeHiddenElements: true });
    expect(svg.props.width).toBe(18);
    expect(svg.props.stroke).toBe('#A6EBCF');
  });

  test('is hidden from VoiceOver', () => {
    render(<Icon name="phone" />);
    expect(screen.queryByTestId('icon-phone')).toBeNull();
    expect(screen.getByTestId('icon-phone', { includeHiddenElements: true })).toBeTruthy();
  });
});
