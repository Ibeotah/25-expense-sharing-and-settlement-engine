import { useState } from 'react';
import { supabase } from '../api.js';
import { loginSchema, registrationSchema } from '../validation/authSchemas.js';

export default function Login({ onLogin, authError = '' }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const isRegistering = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const formValues = { name, email, password, confirmPassword };
    const validation = (isRegistering ? registrationSchema : loginSchema).safeParse(formValues);
    if (!validation.success) {
      setError(validation.error.issues[0]);
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim().replace(/\s+/g, ' ') },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice('Account created. Check your email to confirm it, then sign in.');
          return;
        }
        onLogin(data.user);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onLogin(data.user);
      }
    } catch (err) {
      setError(err.message || `Could not ${isRegistering ? 'create your account' : 'sign in'}.`);
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(isRegistering ? 'login' : 'register');
    setError('');
    setNotice('');
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <a className="brand login-brand" href="#login" aria-label="Settle home"><span className="brand-mark">S</span><span>settle<span className="brand-dot">.</span></span></a>
        <span className="section-index">EXPENSE SHARING ENGINE</span>
        <h1 id="login-title">{isRegistering ? 'Create your account.' : 'Welcome back.'}</h1>
        <p className="login-description">{isRegistering ? 'Create an account to manage shared expenses with your group.' : 'Sign in to manage shared expenses and settle up with your group.'}</p>

        <form className="login-form" onSubmit={submit} noValidate>
          {isRegistering && <label className="field"><span>Full name</span><input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>}
          <label className="field"><span>Email address</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label className="field"><span>Password</span><input type="password" autoComplete={isRegistering ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegistering ? 'At least 8 characters' : 'Enter your password'} /></label>
          {isRegistering && <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></label>}
          {(error || authError) && <div className="alert alert-error" role="alert"><span>!</span><p>{error || authError}</p></div>}
          {notice && <div className="alert alert-success" role="status"><span>✓</span><p>{notice}</p></div>}
          <button className="button button-primary login-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        <p className="login-switch">{isRegistering ? 'Already have an account?' : 'New to settle?'} <button type="button" onClick={switchMode}>{isRegistering ? 'Sign in' : 'Create an account'}</button></p>
        <p className="login-footnote">Your account gives you access to your shared expense workspace.</p>
      </section>
    </main>
  );
}
