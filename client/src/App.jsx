import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { formatPaise, toPaise } from './money.js';

// The token lives only in memory: closing or reloading the tab logs out, and no script can read it from storage.
export default function App() {
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState('');

  const logout = useCallback((message = '') => {
    setSession(null);
    setNotice(message);
  }, []);

  return (
    <main>
      <h1>Mini Secure Banking Simulator</h1>
      {notice && <p className="notice">{notice}</p>}
      {session
        ? <Dashboard token={session.token} onLogout={logout} />
        : <AuthPanel onLogin={(token) => { setNotice(''); setSession({ token }); }} />}
    </main>
  );
}

function Field({ label, error, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function AuthPanel({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ displayName: '', accountId: '', password: '' });
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
          method: 'POST', body: { displayName: form.displayName, password: form.password } });
        setCreated(accountId);
        setForm({ displayName: '', accountId, password: '' });
        setMode('login');
      } else {
        const { token } = await api('/auth/login', {
          method: 'POST', body: { accountId: form.accountId, password: form.password } });
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
        <p className="success">Account created. Your account ID is <strong>{created}</strong>: you log in with it.</p>
      )}
      <form onSubmit={submit}>
        {mode === 'register'
          ? <Field label="Your name" value={form.displayName} onChange={set('displayName')} maxLength={50} required
              error={error?.fields?.displayName} />
          : <Field label="Account ID" value={form.accountId} onChange={set('accountId')} maxLength={10}
              inputMode="numeric" pattern="[0-9]{10}" required error={error?.fields?.accountId} />}
        <Field label="Password" type="password" value={form.password} onChange={set('password')} maxLength={128}
          minLength={mode === 'register' ? 8 : 1} required error={error?.fields?.password}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
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
      <TransferForm call={call} onDone={refresh} />
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

function TransferForm({ call, onDone }) {
  const [to, setTo] = useState('');
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
      setError({ fields: { amount: 'Enter an amount like 250 or 99.50' } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { transfer } = await call('/transfers', { method: 'POST', body: { toAccountId: to, amount, requestKey } });
      // Shown only once the server has confirmed the transfer was saved.
      setDone(`Sent ${formatPaise(transfer.amount)} to ${transfer.toAccountId}.`);
      setTo('');
      setRupees('');
      setRequestKey(crypto.randomUUID());
      await onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Send money</h2>
      <form onSubmit={submit}>
        <Field label="Receiver's account ID" value={to} onChange={edit(setTo)} maxLength={10} inputMode="numeric"
          pattern="[0-9]{10}" required error={error?.fields?.toAccountId} />
        <Field label="Amount (₹)" value={rupees} onChange={edit(setRupees)} maxLength={9} inputMode="decimal" required
          error={error?.fields?.amount} />
        {error?.message && <p className="error">{error.message}</p>}
        {done && <p className="success">{done}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
    </section>
  );
}
