import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';

/** The SCP Foundation emblem (far2/Aelanna, CC BY-SA 3.0) — broken outer ring,
    three notched arrows converging on an inner circle. */
export function Emblem({ size = 22 }: { size?: number }) {
  const arrow = 'm64.7 30.6v24h-5.08l8.08 14 8.08-14h-5.08l-.000265-24h-5.99';
  return (
    <svg viewBox="0 0 135 135" width={size} height={size} aria-hidden="true">
      <circle cx="67.7" cy="71.5" r="33" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="m51.9 11.9h31.7l3.07 11.4.944.391c19.4 8.03 32 26.9 32 47.9 0 2.26-.149 4.53-.445 6.77l-.133 1.01 8.37 8.37-15.8 27.4-11.4-3.06-.809.623c-9.06 6.95-20.2 10.7-31.6 10.7-11.4 6e-5-22.5-3.77-31.6-10.7l-.81-.623-11.4 3.06-15.8-27.4 8.37-8.37-.133-1.01c-.296-2.25-.445-4.51-.445-6.77.000141-21 12.6-39.9 32-47.9l.944-.391z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <g fill="currentColor">
        <path d={arrow} />
        <path transform="rotate(120 67.7 71.5)" d={arrow} />
        <path transform="rotate(240 67.7 71.5)" d={arrow} />
      </g>
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
