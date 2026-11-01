import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

type AuthMode = 'login' | 'register' | 'forgot';
type VerificationStep = 'form' | 'verify_registration' | 'reset_password';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('233')) return `0${digits.slice(3)}`;
  return digits.startsWith('0') ? digits : `0${digits}`;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)) return fallback;
  const validationMessage = error.response?.data?.errors
    ? Object.values(error.response.data.errors).flat()[0]
    : undefined;
  return validationMessage || error.response?.data?.message || fallback;
};

const Login = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<VerificationStep>('form');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'passenger' | 'rider'>('passenger');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    login,
    register,
    verifyRegistration,
    resendRegistrationCode,
    requestPasswordReset,
    resetPassword,
  } = useAuth();

  const updateMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setStep('form');
    setOtp('');
    setPassword('');
    setPasswordConfirmation('');
    setError('');
    setMessage('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const normalizedPhone = formatPhone(phone);
      if (mode === 'login') {
        await login(normalizedPhone, password);
      } else if (mode === 'register') {
        await register({
          name: name.trim(),
          phone: normalizedPhone,
          role,
          password,
          password_confirmation: passwordConfirmation,
        });
        setPhone(normalizedPhone);
        setStep('verify_registration');
        setMessage('We sent a verification code to your phone. Enter it to activate your account.');
      } else {
        await requestPasswordReset(normalizedPhone);
        setPhone(normalizedPhone);
        setStep('reset_password');
        setMessage('If an account exists for this number, a reset code has been sent.');
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(
        requestError,
        mode === 'login' ? 'Could not sign in. Please try again.' : 'Could not complete this request. Please try again.',
      ));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await verifyRegistration(phone, otp);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, 'Could not verify your phone. Check the code and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendRegistrationCode = async () => {
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await resendRegistrationCode(phone);
      setMessage('If your account is awaiting verification, a new code has been sent.');
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, 'Could not resend the code. Please wait and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await resetPassword(phone, otp, password, passwordConfirmation);
      setMode('login');
      setStep('form');
      setOtp('');
      setPassword('');
      setPasswordConfirmation('');
      setMessage('Password changed. Sign in with your new password.');
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, 'Could not reset your password. Check the code and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRegistrationVerification = step === 'verify_registration';
  const isPasswordReset = step === 'reset_password';
  const title = isRegistrationVerification
    ? 'Verify your phone'
    : isPasswordReset
      ? 'Reset your password'
      : mode === 'register'
        ? 'Create your account'
        : mode === 'forgot'
          ? 'Forgot password'
          : 'Welcome back';

  return (
    <main className="auth-page flex min-h-screen flex-col justify-center px-5 py-6 sm:px-8">
      <div className="auth-panel mx-auto w-full max-w-md">
        <header className="auth-header text-center">
          <div className="auth-route-mark" aria-hidden="true">
            <svg viewBox="0 0 48 64" fill="none">
              <path d="M24 59s19-18.1 19-36A19 19 0 1 0 5 23c0 17.9 19 36 19 36Z" />
              <circle cx="24" cy="23" r="7" />
              <path d="M5 49c-2 4-1 8 3 10m33-8c2 4 1 8-3 10" />
            </svg>
          </div>
          <h1 className="auth-wordmark" aria-label="Keke Ride">
            <span><span className="auth-wordmark-k">K</span>eke</span>
            <span>Ride</span>
          </h1>
          {(mode !== 'login' || isRegistrationVerification) && (
            <h2 className="auth-title">{title}</h2>
          )}
          {(isRegistrationVerification || isPasswordReset || mode !== 'login') && (
            <p className="auth-description">
              {isRegistrationVerification
                ? `Enter the six-digit code sent to ${phone}.`
                : isPasswordReset
                  ? `Enter the code sent to ${phone} and choose a new password.`
                  : mode === 'register'
                    ? 'One account for safe, reliable rides.'
                    : 'We’ll send a one-time code to verify your phone.'}
            </p>
          )}
        </header>

        <section className="auth-panel-content">
          {error && (
            <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>
          )}
          {message && (
            <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-800" role="status">{message}</p>
          )}

          {isRegistrationVerification ? (
            <form onSubmit={handleVerifyRegistration} className="space-y-5">
              <label className="auth-label block text-sm font-semibold" htmlFor="registration-otp">
                Verification code
                <input
                  id="registration-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="mt-2 block w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-amber-500"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className="auth-primary w-full rounded-xl bg-brand px-4 py-3.5 font-bold text-slate-950 shadow-sm shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-60"
              >
                {isSubmitting ? 'Verifying…' : 'Verify and continue'}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleResendRegistrationCode()}
                className="w-full text-sm font-semibold text-amber-800 underline disabled:opacity-50"
              >
                Resend verification code
              </button>
              <button
                type="button"
                onClick={() => updateMode('login')}
                className="w-full text-sm text-gray-500 hover:text-gray-800"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form
              onSubmit={isPasswordReset ? handleResetPassword : handleSubmit}
              className="space-y-4"
            >
              {mode === 'register' && (
                <>
                  <label className="auth-label block text-sm font-semibold" htmlFor="register-name">
                    Full name
                    <input
                      id="register-name"
                      type="text"
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="auth-label block text-sm font-semibold" htmlFor="register-role">
                    I want to
                    <select
                      id="register-role"
                      value={role}
                      onChange={(event) => setRole(event.target.value as 'passenger' | 'rider')}
                      className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-amber-500"
                    >
                      <option value="passenger">Book Keke rides</option>
                      <option value="rider">Drive with Keke Ride</option>
                    </select>
                  </label>
                </>
              )}

              <label className="auth-label block text-sm font-semibold" htmlFor="auth-phone">
                Phone number
                <input
                  id="auth-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  required
                  minLength={10}
                  maxLength={15}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                  placeholder="+233 551 123 456"
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500"
                />
              </label>

              {isPasswordReset && (
                <label className="auth-label block text-sm font-semibold" htmlFor="reset-otp">
                  Verification code
                  <input
                    id="reset-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    minLength={6}
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500"
                  />
                </label>
              )}

              {(mode === 'login' || mode === 'register' || isPasswordReset) && (
                <label className="auth-label block text-sm font-semibold" htmlFor="auth-password">
                  {isPasswordReset ? 'New password' : 'Password'}
                  <span className="auth-password-field mt-1.5 block">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="block w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m3 3 18 18M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.3C3.5 8.1 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.6-.8" />
                          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        </svg>
                      )}
                    </button>
                  </span>
                </label>
              )}

              {(mode === 'register' || isPasswordReset) && (
                <label className="auth-label block text-sm font-semibold" htmlFor="confirm-password">
                  Confirm password
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500"
                  />
                </label>
              )}

              {mode === 'forgot' && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                  You’ll verify the phone number with a one-time code, then choose a new password.
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="auth-primary w-full rounded-xl bg-brand px-4 py-3.5 font-bold text-slate-950 shadow-sm shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Please wait…'
                  : isPasswordReset
                    ? 'Set new password'
                    : mode === 'forgot'
                      ? 'Send reset code'
                      : mode === 'register'
                        ? 'Create account'
                        : 'Sign in'}
              </button>
            </form>
          )}

          {!isRegistrationVerification && !isPasswordReset && (
            <div className="auth-links mt-5 flex flex-col items-center gap-3 text-sm">
              {mode === 'login' ? (
                <>
                  <p className="auth-phone-hint">Sign in with your phone number</p>
                  <button
                    type="button"
                    onClick={() => updateMode('forgot')}
                    className="font-semibold text-amber-800 hover:underline"
                  >
                    Forgot password?
                  </button>
                  <p className="auth-register-prompt text-gray-600">
                    New to Keke Ride?{' '}
                    <button
                      type="button"
                      onClick={() => updateMode('register')}
                      className="font-bold text-amber-800 hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                </>
              ) : (
                <p className="text-gray-600">
                  {mode === 'forgot' ? 'Remember your password?' : 'Already have an account?'}{' '}
                  <button
                    type="button"
                    onClick={() => updateMode('login')}
                    className="font-bold text-amber-800 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          )}

          {isPasswordReset && (
            <button
              type="button"
              onClick={() => updateMode('login')}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-800"
            >
              Back to sign in
            </button>
          )}
        </section>
      </div>
    </main>
  );
};

export default Login;
