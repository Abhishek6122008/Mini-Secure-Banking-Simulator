import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { formatPaise, toPaise } from './money.js';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = getCountries().map((code) => ({
  code,
  name: regionNames.of(code) || code,
  callingCode: getCountryCallingCode(code),
  flag: String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0))),
})).sort((a, b) => a.name.localeCompare(b.name));

// Keep the short-lived token for this tab so a page refresh can restore the session.
const SESSION_KEY = 'banking-session-token';

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const token = sessionStorage.getItem(SESSION_KEY);
      return token ? { token } : null;
    } catch {
      return null;
    }
  });
  const [notice, setNotice] = useState('');

  const logout = useCallback((message = '') => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Storage may be unavailable; clearing in-memory state still logs out this view.
    }
    setSession(null);
    setNotice(message);
  }, []);

  const login = useCallback((token) => {
    try {
      sessionStorage.setItem(SESSION_KEY, token);
    } catch {
      // Keep the session in memory if browser storage is unavailable.
    }
    setNotice('');
    setSession({ token });
  }, []);

  return (
    <main>
      <h1>Mini Secure Banking Simulator</h1>
      {notice && <p className="notice">{notice}</p>}
      {session
        ? <Dashboard token={session.token} onLogout={logout} />
        : <AuthPanel onLogin={login} />}
    </main>
  );
}

function Field({ label, error, hint, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
      {error && <span className="field-error">{error}</span>}
      {hint && <span className="muted">{hint}</span>}
    </label>
  );
}

function PhoneNumberInput({ country, setCountry, value, onChange, error }) {
  const [editing, setEditing] = useState(false);

  return (
    <label>
      Phone number
      <div className="phone-input">
        <span className="country-flag" aria-hidden="true">{countries.find((item) => item.code === country)?.flag}</span>
        <select aria-label="Country calling code" value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((item) => <option key={item.code} value={item.code}>
            {item.flag} {item.name} (+{item.callingCode})
          </option>)}
        </select>
        <span className="calling-code">+{getCountryCallingCode(country)}</span>
        <input aria-label="10 digit phone number" type="tel" inputMode="numeric" autoComplete="off"
          readOnly={!editing} onFocus={() => setEditing(true)}
          value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
          maxLength={10} minLength={10} pattern="[0-9]{10}" placeholder="10 digit number" required />
      </div>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function AuthPanel({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [loginMethod, setLoginMethod] = useState('phone');
  const [accountIdEditing, setAccountIdEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', phoneNumber: '', password: '', accountId: '' });
  const [country, setCountry] = useState('IN');
  const [error, setError] = useState(null);
  const [created, setCreated] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        const { accountId } = await api('/auth/register', {
          method: 'POST', body: { email: form.email, countryCode: `+${getCountryCallingCode(country)}`,
            phoneNumber: form.phoneNumber, displayName: form.displayName, password: form.password } });
        setCreated(accountId);
        setForm({ displayName: '', email: '', phoneNumber: '', accountId: '', password: '' });
        setMode('login');
      } else {
        const { token } = await api('/auth/login', {
          method: 'POST', body: {
            ...(loginMethod === 'phone'
              ? { phoneNumber: `+${getCountryCallingCode(country)}${form.phoneNumber}` }
              : { accountId: form.accountId }),
            password: form.password,
          } });
        onLogin(token);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          Create account
        </button>
      </div>
      {created && mode === 'login' && (
        <p className="success">Account created. Log in with your phone number or account number. Account number: <strong>{created}</strong>.</p>
      )}
      <form onSubmit={submit} autoComplete="off">
        {mode === 'register'
          ? <>
              <Field label="Email" type="email" value={form.email} onChange={set('email')} maxLength={254} required
                autoComplete="email" placeholder="you@example.com" error={error?.fields?.email} />
              <PhoneNumberInput country={country} setCountry={setCountry} value={form.phoneNumber}
                onChange={(phoneNumber) => setForm({ ...form, phoneNumber })}
                error={error?.fields?.phoneNumber ?? error?.fields?.countryCode} />
              <Field label="Your name" value={form.displayName} onChange={set('displayName')} maxLength={50} required
                autoComplete="name" placeholder="Your full name" error={error?.fields?.displayName} />
            </>
          : <>
              <div className="tabs" role="tablist" aria-label="Choose login method">
                <button type="button" role="tab" aria-selected={loginMethod === 'phone'}
                  className={loginMethod === 'phone' ? 'active' : ''} onClick={() => setLoginMethod('phone')}>
                  Phone number
                </button>
                <button type="button" role="tab" aria-selected={loginMethod === 'account'}
                  className={loginMethod === 'account' ? 'active' : ''} onClick={() => setLoginMethod('account')}>
                  Account number
                </button>
              </div>
              {loginMethod === 'phone'
                ? <PhoneNumberInput country={country} setCountry={setCountry} value={form.phoneNumber}
                    onChange={(phoneNumber) => setForm({ ...form, phoneNumber })}
                    error={error?.fields?.phoneNumber} />
                : <Field label="Account number" value={form.accountId ?? ''}
                    onChange={(e) => setForm({ ...form, accountId: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    maxLength={10} inputMode="numeric" pattern="[1-9][0-9]{9}" autoComplete="off"
                    readOnly={!accountIdEditing} onFocus={() => setAccountIdEditing(true)}
                    placeholder="10-digit account number" required hint="You can only write numbers in this field."
                    error={error?.fields?.accountId} />}
            </>}
        <Field label="Password" type="password" value={form.password} onChange={set('password')} maxLength={16}
          minLength={mode === 'register' ? 8 : 1} required
          pattern={mode === 'register' ? '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}' : undefined}
          title={mode === 'register' ? 'Use 8 to 16 characters with uppercase and lowercase letters, a number, and a special symbol.' : undefined}
          autoComplete="off" placeholder={mode === 'register' ? 'Create a strong password' : 'Enter your password'}
          error={error?.fields?.password}
        />
        {mode === 'register' && <p className="muted">Use 8 to 16 characters, including uppercase and lowercase letters, a number, and a special symbol.</p>}
        {error && !Object.keys(error.fields ?? {}).length && <p className="error">{error.message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}</button>
      </form>
    </section>
  );
}

function Dashboard({ token, onLogout }) {
  const [account, setAccount] = useState(null);
  const [history, setHistory] = useState({ items: [], nextCursor: null });

  // Any 401 means the token expired or was rejected: back to the login screen.
  const call = useCallback(async (path, options = {}) => {
    try {
      return await api(path, { ...options, token });
    } catch (err) {
      if (err.status === 401) onLogout('Your session ended. Please log in again.');
      throw err;
    }
  }, [token, onLogout]);

  const refresh = useCallback(async () => {
    const [me, page] = await Promise.all([call('/account'), call('/transactions?limit=10')]);
    setAccount(me);
    setHistory(page);
  }, [call]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  async function loadMore() {
    const page = await call(`/transactions?limit=10&before=${history.nextCursor}`);
    setHistory({ items: [...history.items, ...page.items], nextCursor: page.nextCursor });
  }

  if (!account) return <p>Loading…</p>;
  return (
    <>
      <section className="card">
        <div className="row">
          <div>
            <div className="muted">Welcome, {account.displayName}</div>
            <div>Account ID <strong>{account.accountId}</strong></div>
          </div>
          <button type="button" className="secondary" onClick={() => onLogout('')}>Log out</button>
        </div>
        <div className="balance">{formatPaise(account.balance)}</div>
      </section>
      <TransferForm call={call} onDone={refresh} balance={account.balance} />
      <section className="card">
        <h2>History</h2>
        {history.items.length === 0 && <p className="muted">No transfers yet.</p>}
        <ul className="history">
          {history.items.map((t) => (
            <li key={t.id}>
              <span>{t.direction === 'sent' ? `To ${t.counterpartyAccountId}` : `From ${t.counterpartyAccountId}`}</span>
              <span className={t.direction}>{t.direction === 'sent' ? '−' : '+'}{formatPaise(t.amount)}</span>
              <span className="muted">{new Date(t.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
        {history.nextCursor && <button type="button" className="secondary" onClick={loadMore}>Load more</button>}
      </section>
    </>
  );
}

function TransferForm({ call, onDone, balance }) {
  const [recipientType, setRecipientType] = useState('account');
  const [to, setTo] = useState('');
  const [accountIdEditing, setAccountIdEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('IN');
  const [rupees, setRupees] = useState('');
  // One request key per intended transfer: a double click or a retry of the same transfer reuses it, so the server
  // processes it once. Editing the form starts a new transfer with a new key.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState('');

  const edit = (setter) => (e) => {
    setter(e.target.value);
    setRequestKey(crypto.randomUUID());
    setDone('');
  };

  async function submit(e) {
    e.preventDefault();
    const amount = toPaise(rupees);
    if (!amount) {
      setError({ fields: { amount: 'Invalid value. Enter a valid amount in rupees.' } });
      return;
    }
    if (BigInt(amount) < 50_000n) {
      setError({ fields: { amount: 'Minimum transfer amount is ₹500.' } });
      return;
    }
    if (BigInt(amount) > BigInt(balance)) {
      setError({ fields: { amount: 'Insufficient amount. This exceeds your available balance.' } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const recipient = recipientType === 'phone' ? `+${getCountryCallingCode(country)}${phone}` : to;
      const { transfer } = await call('/transfer', { method: 'POST', body: { recipient, amount, requestKey } });
      // Shown only once the server has confirmed the transfer was saved.
      setDone(`Sent ${formatPaise(transfer.amount)} to ${transfer.toAccountId}.`);
      setTo('');
      setPhone('');
      setRupees('');
      setRequestKey(crypto.randomUUID());
      await onDone();
    } catch (err) {
      if (err.message === 'Insufficient funds') {
        setError({ fields: { amount: 'Insufficient amount. This exceeds your available balance.' } });
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Send money</h2>
      <div className="tabs recipient-tabs" role="tablist" aria-label="Choose how to find the recipient">
        <button type="button" role="tab" aria-selected={recipientType === 'account'}
          className={recipientType === 'account' ? 'active' : ''} onClick={() => {
            setRecipientType('account'); setRequestKey(crypto.randomUUID()); setDone('');
          }}>
          Account number
        </button>
        <button type="button" role="tab" aria-selected={recipientType === 'phone'}
          className={recipientType === 'phone' ? 'active' : ''} onClick={() => {
            setRecipientType('phone'); setRequestKey(crypto.randomUUID()); setDone('');
          }}>
          Phone number
        </button>
      </div>
      <form onSubmit={submit} autoComplete="off">
        {recipientType === 'account'
          ? <Field label="Receiver's account ID" value={to}
              onChange={(e) => { setTo(e.target.value.replace(/\D/g, '').slice(0, 10)); setRequestKey(crypto.randomUUID()); setDone(''); }}
              maxLength={10} inputMode="numeric" pattern="[0-9]{10}" autoComplete="off"
              readOnly={!accountIdEditing} onFocus={() => setAccountIdEditing(true)} required
              hint="You can only write numbers in this field." error={error?.fields?.recipient} />
          : <PhoneNumberInput country={country} setCountry={(value) => {
              setCountry(value); setRequestKey(crypto.randomUUID()); setDone('');
            }} value={phone} onChange={(value) => {
              setPhone(value); setRequestKey(crypto.randomUUID()); setDone('');
            }}
              error={error?.fields?.recipient} />}
        <Field label={`Amount (₹) — minimum ₹500, available ${formatPaise(balance)}`} value={rupees} onChange={edit(setRupees)} maxLength={13} inputMode="decimal" required
          error={error?.fields?.amount} />
        {error?.message && <p className="error">{error.message}</p>}
        {done && <p className="success">{done}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
    </section>
  );
}
