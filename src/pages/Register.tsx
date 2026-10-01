import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import { ErrorBox } from '../components/Ui';
import { useAuth } from '../auth';
import { passkeysSupported, verifyNewPasskey } from '../webauthn';

export default function Register() {
  const { setUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [regToken, setRegToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doPasskey = async () => {
    setPkBusy(true);
    setError(null);
    try {
      setRegToken(await verifyNewPasskey());
    } catch (e) {
      setError(apiErr(e));
    } finally {
      setPkBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regToken) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.register(username.trim(), password, displayName.trim() || undefined, regToken);
      setUser(user);
      navigate('/');
    } catch (e) {
      setError(apiErr(e));
      setBusy(false);
    }
  };

  return (
    <div className="form-card">
      <h1 className="display-md" style={{ textAlign: 'center', marginBottom: 12 }}>
        {t('register.title')}
      </h1>
      <p className="muted caption" style={{ textAlign: 'center', margin: '0 0 32px' }}>
        {t('register.sub')}
      </p>

      <div className="step-label">{t('register.step1')}</div>
      {regToken ? (
        <div className="notice passkey-done">
          <span>{t('register.passkeyDone')}</span>
          <button type="button" className="btn-quiet" onClick={() => { setRegToken(null); setError(null); }}>
            {t('register.passkeyRedo')}
          </button>
        </div>
      ) : (
        <div className="passkey-panel">
          <p className="muted" style={{ marginTop: 0 }}>{t('register.passkeySub')}</p>
          {!passkeysSupported && <ErrorBox message={t('errors.passkey_unsupported')} />}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 14 }}
            onClick={doPasskey}
            disabled={pkBusy || !passkeysSupported}
          >
            {pkBusy ? t('register.passkeyBusy') : t('register.passkeyBtn')}
          </button>
        </div>
      )}

      {regToken && (
        <>
          <div className="step-label" style={{ marginTop: 30 }}>{t('register.step2')}</div>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">{t('register.username')}</label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
              <span className="hint">{t('register.usernameHint')}</span>
            </div>
            <div className="field">
              <label htmlFor="displayName">
                {t('register.display')} <span className="muted" style={{ fontWeight: 400 }}>{t('register.optional')}</span>
              </label>
              <input
                id="displayName"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={username || t('register.displayPh')}
              />
            </div>
            <div className="field">
              <label htmlFor="password">{t('register.password')}</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <span className="hint">{t('register.passwordHint')}</span>
            </div>
            {error && <div style={{ marginBottom: 18 }}><ErrorBox message={error} /></div>}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={busy || username.trim().length < 3 || password.length < 8}
            >
              {busy ? t('register.busy') : t('register.submit')}
            </button>
          </form>
        </>
      )}

      {!regToken && error && <div style={{ marginTop: 18 }}><ErrorBox message={error} /></div>}
      <div className="alt">
        {t('register.already')} <Link to="/signin">{t('register.signin')}</Link>
      </div>
    </div>
  );
}
