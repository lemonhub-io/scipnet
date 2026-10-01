import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import { ErrorBox } from '../components/Ui';
import { useAuth } from '../auth';
import { passkeysSupported, signInWithPasskey } from '../webauthn';

export default function SignIn() {
  const { setUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(username.trim(), password);
      setUser(user);
      navigate('/');
    } catch (e) {
      setError(apiErr(e));
      setBusy(false);
    }
  };

  const passkeyLogin = async () => {
    setPkBusy(true);
    setError(null);
    try {
      setUser(await signInWithPasskey(username.trim() || undefined));
      navigate('/');
    } catch (e) {
      setError(apiErr(e));
      setPkBusy(false);
    }
  };

  return (
    <div className="form-card">
      <h1 className="display-md" style={{ textAlign: 'center', marginBottom: 36 }}>
        {t('signin.title')}
      </h1>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="username">{t('signin.username')}</label>
          <input
            id="username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">{t('signin.password')}</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <div style={{ marginBottom: 18 }}><ErrorBox message={error} /></div>}
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy || pkBusy || !username || !password}>
          {busy ? t('signin.busy') : t('signin.submit')}
        </button>
      </form>
      {passkeysSupported && (
        <>
          <div className="or-divider"><span>{t('signin.or')}</span></div>
          <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={passkeyLogin} disabled={busy || pkBusy}>
            {pkBusy ? t('signin.passkeyBusy') : t('signin.passkey')}
          </button>
          <p className="hint" style={{ textAlign: 'center', margin: '10px 0 0' }}>{t('signin.passkeyHint')}</p>
        </>
      )}
      <div className="alt">
        {t('signin.newHere')} <Link to="/register">{t('signin.create')}</Link>
      </div>
    </div>
  );
}
