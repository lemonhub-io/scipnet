import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';

/** Foundation-style emblem — three inward bent arrows in a ring, three dots. */
export function Emblem({ size = 22 }: { size?: number }) {
  const arrow = 'M24 7 V16.5 M19.5 12 L24 16.5 L28.5 12';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <circle cx="24" cy="24" r="19.5" fill="none" stroke="currentColor" strokeWidth="4" />
      <g fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="square">
        <path d={arrow} />
        <path transform="rotate(120 24 24)" d={arrow} />
        <path transform="rotate(240 24 24)" d={arrow} />
      </g>
      <circle cx="24" cy="37.6" r="2.7" fill="currentColor" />
      <circle cx="12.4" cy="17.2" r="2.7" fill="currentColor" />
      <circle cx="35.6" cy="17.2" r="2.7" fill="currentColor" />
    </svg>
  );
}

export function Nav() {
  const { user, setUser } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const signOut = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setMenuOpen(false);
    navigate('/');
  };

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');

  return (
    <header className="nav">
      <div className="nav-banner">
        <div className="nav-banner-inner">
          <span>{t('nav.banner')}</span>
          <span className="banner-mid">{t('nav.bannerMid')}</span>
          <span className="spacer" />
          <span className="nav-tag">
            {t('nav.bannerTag')}
            <span className="blink">_</span>
          </span>
        </div>
      </div>
      <div className="nav-bar">
        <div className="nav-inner">
          <Link to="/" className="nav-logo">
            <Emblem />
            <span>
              SCiPNET<span className="scp-f"> / SCP-F</span>
            </span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {t('nav.latest')}
            </NavLink>
            <Link to="/#topics" className="nav-link">
              {t('nav.topics')}
            </Link>
            <NavLink to="/docs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {t('nav.api')}
            </NavLink>
          </nav>
          <div className="nav-right">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get('q')?.toString().trim();
                navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
              }}
            >
              <input
                className="nav-search"
                type="search"
                name="q"
                placeholder={t('nav.search')}
                defaultValue={params.get('q') ?? ''}
                aria-label={t('nav.searchAria')}
              />
            </form>
            <button className="nav-lang" onClick={toggleLang} aria-label={t('nav.switchLangAria')}>
              {t('nav.switchLang')}
            </button>
            {user ? (
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  className="nav-user"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <Avatar user={user} size="xs" />
                  <span>{user.displayName}</span>
                </button>
                {menuOpen && (
                  <div className="nav-menu" role="menu">
                    <Link to={`/u/${user.username}`} onClick={() => setMenuOpen(false)}>
                      {t('nav.profile')}
                    </Link>
                    <Link to="/new" onClick={() => setMenuOpen(false)}>
                      {t('nav.newThread')}
                    </Link>
                    <button onClick={signOut}>{t('nav.signOut')}</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/signin" className="nav-link">
                  {t('nav.signIn')}
                </Link>
                <Link to="/register" className="nav-link" style={{ color: '#fff', fontWeight: 600 }}>
                  {t('nav.join')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="nav-hatch" aria-hidden="true" />
    </header>
  );
}
