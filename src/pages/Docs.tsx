import { Trans, useTranslation } from 'react-i18next';

const GROUPS: { tag: string; rows: [string, string, string][] }[] = [
  {
    tag: 'auth',
    rows: [
      ['POST', '/api/auth/webauthn/register/options', 'waRegOptions'],
      ['POST', '/api/auth/webauthn/register/verify', 'waRegVerify'],
      ['POST', '/api/auth/register', 'register'],
      ['POST', '/api/auth/webauthn/login/options', 'waLoginOptions'],
      ['POST', '/api/auth/webauthn/login/verify', 'waLoginVerify'],
      ['POST', '/api/auth/login', 'login'],
      ['POST', '/api/auth/logout', 'logout'],
      ['GET', '/api/auth/me', 'me'],
      ['PATCH', '/api/auth/me', 'patchMe'],
    ],
  },
  {
    tag: 'categories',
    rows: [
      ['GET', '/api/categories', 'listCats'],
      ['GET', '/api/categories/{slug}', 'getCat'],
    ],
  },
  {
    tag: 'threads',
    rows: [
      ['GET', '/api/threads', 'listThreads'],
      ['POST', '/api/threads', 'createThread'],
      ['GET', '/api/threads/{id}', 'getThread'],
      ['PATCH', '/api/threads/{id}', 'patchThread'],
      ['DELETE', '/api/threads/{id}', 'delThread'],
      ['POST', '/api/threads/{id}/like', 'like'],
    ],
  },
  {
    tag: 'replies',
    rows: [
      ['GET', '/api/threads/{id}/replies', 'listReplies'],
      ['POST', '/api/threads/{id}/replies', 'createReply'],
      ['DELETE', '/api/replies/{id}', 'delReply'],
    ],
  },
  {
    tag: 'usersMedia',
    rows: [
      ['GET', '/api/users/{username}', 'getUser'],
      ['GET', '/api/users/{username}/threads', 'userThreads'],
      ['POST', '/api/uploads/avatar', 'uploadAvatar'],
      ['POST', '/api/uploads/attachment', 'uploadAttachment'],
      ['GET', '/media/{key}', 'media'],
    ],
  },
  {
    tag: 'push',
    rows: [
      ['GET', '/api/push/vapid', 'pushVapid'],
      ['PUT', '/api/push/subscriptions', 'pushSubscribe'],
      ['DELETE', '/api/push/subscriptions', 'pushUnsub'],
      ['POST', '/api/push/test', 'pushTest'],
    ],
  },
];

const code = <code />;

export default function Docs() {
  const { t } = useTranslation();
  const origin = window.location.origin;

  return (
    <div className="read" style={{ paddingTop: 72, paddingBottom: 96 }}>
      <h1 className="hero-display" style={{ fontSize: 'clamp(30px, 5vw, 44px)' }}>
        {t('docs.title')}
      </h1>
      <p className="lead" style={{ margin: '16px 0 0', fontSize: 19 }}>
        {t('docs.lead')}
      </p>

      <p style={{ margin: '32px 0 0' }}>
        <Trans
          i18nKey="docs.spec"
          components={[<a href="/api/openapi.json"><code /></a>, code, <a href="/api/docs" target="_blank" rel="noreferrer"><code /></a>, code, code]}
        />
      </p>

      <h2 className="display-md" style={{ margin: '48px 0 12px' }}>{t('docs.conventions')}</h2>
      <p style={{ margin: '0 0 12px' }}>
        <strong>{t('docs.terms.auth')}</strong>{' '}
        <Trans i18nKey="docs.auth" components={[code, code, code, code, code]} />
      </p>
      <p style={{ margin: '0 0 12px' }}>
        <strong>{t('docs.terms.passkey')}</strong>{' '}
        <Trans i18nKey="docs.passkey" components={[code, code, code, code, code]} />
      </p>
      <p style={{ margin: '0 0 12px' }}>
        <strong>{t('docs.terms.errors')}</strong>{' '}
        <Trans i18nKey="docs.errors" components={[code, code, code, code, code, code, code, code, code, code, code]} />
      </p>
      <p style={{ margin: '0 0 12px' }}>
        <strong>{t('docs.terms.pagination')}</strong>{' '}
        <Trans i18nKey="docs.pagination" components={[code, code, code, code, code]} />
      </p>
      <p style={{ margin: '0 0 12px' }}>
        <strong>{t('docs.terms.media')}</strong>{' '}
        <Trans i18nKey="docs.media" components={[code, code, code]} />
      </p>
      <div className="doc-pre" style={{ marginTop: 24 }}>
        <code>
          {`curl -c jar.txt -X POST ${origin}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"linus","password":"correct horse battery"}'

curl -b jar.txt ${origin}/api/threads?category=engineering&sort=top`}
        </code>
      </div>

      <h2 className="display-md" style={{ margin: '56px 0 4px' }}>{t('docs.endpoints')}</h2>
      {GROUPS.map((g) => (
        <div className="doc-group" key={g.tag}>
          <div className="doc-tag">{t(`docs.groups.${g.tag}`)}</div>
          <div className="rows" style={{ borderTop: 0 }}>
            {g.rows.map(([m, p, d]) => (
              <div className="doc-row" key={m + p}>
                <span className="doc-method">{m}</span>
                <span className="doc-path">{p}</span>
                <span className="doc-desc">{t(`docs.rows.${d}`)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="caption muted" style={{ marginTop: 40 }}>
        {t('docs.questions')}
      </p>
    </div>
  );
}
