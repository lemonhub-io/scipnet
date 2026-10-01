import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import { canInstall, promptInstall, subscribeInstall } from '../pwa';

export function Footer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <h4>{t('footer.terminal')}</h4>
          <Link to="/">{t('footer.latest')}</Link>
          <Link to="/#topics">{t('footer.allTopics')}</Link>
          {user ? (
            <Link to="/new">{t('footer.newThread')}</Link>
          ) : (
            <Link to="/register">{t('footer.createAccount')}</Link>
          )}
          {installable && (
            <button className="footer-install" onClick={() => void promptInstall()}>
              {t('pwa.install')}
            </button>
          )}
        </div>
        <div>
          <h4>{t('footer.site')}</h4>
          <Link to="/c/general">{t('cats.general.name')}</Link>
          <Link to="/c/meta">{t('cats.meta.name')}</Link>
          <Link to="/c/announcements">{t('cats.announcements.name')}</Link>
        </div>
        <div>
          <h4>{t('footer.technical')}</h4>
          <Link to="/docs">{t('footer.apiRef')}</Link>
          <a href="/api/docs" target="_blank" rel="noreferrer">
            {t('footer.interactiveDocs')}
          </a>
          <a href="/api/openapi.json" target="_blank" rel="noreferrer">
            {t('footer.openapi')}
          </a>
          <a href="https://github.com/lemonhub-io/scipnet" target="_blank" rel="noreferrer">
            {t('footer.source')}
          </a>
        </div>
      </div>
      <div className="footer-warn">
        <p>
          <span className="red">■ </span>
          {t('footer.warning')}
        </p>
      </div>
      <div className="footer-legal">
        <span>{t('footer.legal')}</span>
        <span>{t('footer.motto')}</span>
      </div>
    </footer>
  );
}
