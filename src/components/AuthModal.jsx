import { useEffect, useState } from 'react'

const emptyLogin = { email: '', password: '' }
const emptySignup = {
  display_name: '',
  username: '',
  email: '',
  password: '',
  password2: '',
}

export default function AuthModal({ open, initialMode = 'login', onLogin, onSignup }) {
  const [mode, setMode] = useState(initialMode)
  const [loginForm, setLoginForm] = useState(emptyLogin)
  const [signupForm, setSignupForm] = useState(emptySignup)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setError('')
    setNotice('')
  }, [open, initialMode])

  if (!open) return null

  async function submitLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await onLogin(loginForm)
      setLoginForm(emptyLogin)
    } catch (err) {
      setError(err.message || 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitSignup(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await onSignup(signupForm)
      setSignupForm(emptySignup)
      setMode('login')
      setNotice('Account created. Log in with your email and password.')
    } catch (err) {
      setError(err.message || 'Signup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-label="Authentication">
        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
              setNotice('')
            }}
          >
            Login
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            type="button"
            onClick={() => {
              setMode('signup')
              setError('')
              setNotice('')
            }}
          >
            Sign up
          </button>
        </div>

        <div className="auth-heading">
          <div className="brand-mark">C</div>
          <div>
            <h1>{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
            <p>{mode === 'login' ? 'Log in to open your conversations.' : 'Only the fields required by the backend.'}</p>
          </div>
        </div>

        {notice && <div className="form-notice success">{notice}</div>}
        {error && <div className="form-notice error">{error}</div>}

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={submitLogin}>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={loginForm.email}
                onChange={(e) => setLoginForm((form) => ({ ...form, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm((form) => ({ ...form, password: e.target.value }))}
                placeholder="Your password"
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Logging in…' : 'Login'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitSignup}>
            <label>
              Display name <span className="optional">optional</span>
              <input
                value={signupForm.display_name}
                onChange={(e) => setSignupForm((form) => ({ ...form, display_name: e.target.value }))}
                placeholder="How people see you"
              />
            </label>
            <label>
              Username
              <input
                autoComplete="username"
                required
                value={signupForm.username}
                onChange={(e) => setSignupForm((form) => ({ ...form, username: e.target.value }))}
                placeholder="username"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={signupForm.email}
                onChange={(e) => setSignupForm((form) => ({ ...form, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </label>
            <div className="password-grid">
              <label>
                Password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={signupForm.password}
                  onChange={(e) => setSignupForm((form) => ({ ...form, password: e.target.value }))}
                />
              </label>
              <label>
                Confirm
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={signupForm.password2}
                  onChange={(e) => setSignupForm((form) => ({ ...form, password2: e.target.value }))}
                />
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
