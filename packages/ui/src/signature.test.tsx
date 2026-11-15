import { fireEvent, render, screen } from '@testing-library/react-native';
import { BoxMark, SlideToConfirm } from './signature';

describe('BoxMark', () => {
  it('shows letters and digits apart and spells the code out for screen readers', () => {
    render(<BoxMark code="KT47" />);
    expect(screen.getByText('KT')).toBeTruthy();
    expect(screen.getByText('47')).toBeTruthy();
    expect(screen.getByLabelText('Box mark K T 4 7')).toBeTruthy();
  });
});

describe('SlideToConfirm', () => {
  it('confirms once through the accessibility action', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to confirm pickup" onConfirm={onConfirm} testID="slide" />);
    const control = screen.getByTestId('slide');
    fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ignores activation while disabled', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to hand over" onConfirm={onConfirm} disabled testID="slide" />);
    fireEvent(screen.getByTestId('slide'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('slide').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
