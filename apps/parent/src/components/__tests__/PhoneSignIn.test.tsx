import { ThemeProvider, ToastProvider, otpStore } from '@lunchbox/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import '../../i18n';
import { startPhoneSignIn } from '../../lib/firebase';
import { PhoneSignIn } from '../PhoneSignIn';

jest.mock('../../lib/firebase', () => ({ startPhoneSignIn: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const start = startPhoneSignIn as jest.Mock;
const disabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;

function renderSignIn() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <PhoneSignIn tagline="Sign in" />
      </ToastProvider>
    </ThemeProvider>,
  );
}

async function sendCode() {
  fireEvent.changeText(screen.getByTestId('phone-input'), '9876543210');
  await act(async () => {
    fireEvent.press(screen.getByTestId('send-code'));
  });
}

describe('PhoneSignIn', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    otpStore.clear();
    start.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks Firebase for a fresh SMS when the parent taps Resend', async () => {
    start.mockResolvedValue({ confirm: jest.fn() });
    renderSignIn();
    await sendCode();
    expect(start).toHaveBeenLastCalledWith('+919876543210', false);

    // Resend waits 30 seconds after the first code.
    expect(disabled('resend-code')).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(disabled('resend-code')).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('resend-code'));
    });
    expect(start).toHaveBeenLastCalledWith('+919876543210', true);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('stops accepting codes after five wrong ones and asks for a new code', async () => {
    const confirm = jest.fn().mockRejectedValue(Object.assign(new Error('bad'), { code: 'auth/invalid-verification-code' }));
    start.mockResolvedValue({ confirm });
    renderSignIn();
    await sendCode();
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
      });
    }
    expect(confirm).toHaveBeenCalledTimes(5);
    expect(screen.getByText('Too many wrong codes. Ask for a new code.')).toBeTruthy();
    expect(disabled('verify-code')).toBe(true);
  });

  it('shows how long the code stays valid', async () => {
    start.mockResolvedValue({ confirm: jest.fn() });
    renderSignIn();
    await sendCode();
    expect(screen.getByText('Code valid for 10:00')).toBeTruthy();
  });
});
