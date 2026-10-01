import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import type { Category, Page, ThreadSummary } from '../../shared/api-types';
import { catDesc, catName } from '../i18n';
import { Empty, ErrorBox, Loading, Pagination } from '../components/Ui';
import { ThreadRow } from '../components/ThreadRow';
import { useAuth } from '../auth';

export default function Home() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [threads, setThreads] = useState<Page<ThreadSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories)).catch((e) => setError(apiErr(e)));
  }, []);

  useEffect(() => {
    setThreads(null);
    api
      .threads({ q: q || undefined, page, limit: 20 })
      .then(setThreads)
      .catch((e) => setError(apiErr(e)));
  }, [q, page]);

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  };

  return (
    <>
      {!q && (
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">{t('hero.eyebrow')}</p>
            <h1 className="hero-display">{t('hero.title')}</h1>
            <p className="lead">{t('hero.lead')}</p>
            <div className="hero-cta">
              <Link to={user ? '/new' : '/register'} className="btn btn-primary">
                {user ? t('hero.start') : t('hero.join')}
              </Link>
              <Link to="/docs" className="btn btn-ghost">
                {t('hero.api')}
              </Link>
            </div>
            <div className="hero-stamp" aria-hidden="true">{t('hero.stamp')}</div>
          </div>
        </section>
      )}

      {error && (
        <div className="wrap" style={{ paddingTop: 24 }}>
          <ErrorBox message={error} />
        </div>
      )}

      {q ? (
        <section className="section">
          <div className="wrap">
            <div className="section-head">
              <h2 className="display-md">{t('home.resultsFor', { q })}</h2>
              <Link to="/" className="btn-quiet">
                {t('home.clear')}
              </Link>
            </div>
            {!threads ? (
              <Loading />
            ) : threads.data.length === 0 ? (
              <Empty>{t('home.noMatch', { q })}</Empty>
            ) : (
              <>
                <div className="rows">
                  {threads.data.map((t) => (
                    <ThreadRow key={t.id} thread={t} showCategory />
                  ))}
                </div>
                <Pagination page={threads.page} totalPages={threads.totalPages} onPage={setPage} />
              </>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="section" id="topics">
            <div className="wrap">
              <div className="section-head">
                <div>
                  <span className="eyebrow">{t('home.topicsIdx')}</span>
                  <h2 className="display-md">{t('home.topics')}</h2>
                </div>
              </div>
              {!categories ? (
                <Loading />
              ) : (
                <div className="rows">
                  {categories.map((c) => (
                    <Link key={c.id} to={`/c/${c.slug}`} className="row">
                      <div className="row-main">
                        <div className="row-title">{catName(t, c)}</div>
                        <div className="row-sub">{catDesc(t, c)}</div>
                      </div>
                      <div className="row-side">
                        <span className="row-count">
                          <strong>{c.threadCount}</strong> {t('count.threads', { count: c.threadCount })}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="section section-parchment">
            <div className="wrap">
              <div className="section-head">
                <div>
                  <span className="eyebrow">{t('home.latestIdx')}</span>
                  <h2 className="display-md">{t('home.latest')}</h2>
                </div>
                <Link to={user ? '/new' : '/signin'} className="btn btn-primary btn-sm">
                  {t('nav.newThread')}
                </Link>
              </div>
              {!threads ? (
                <Loading />
              ) : threads.data.length === 0 ? (
                <Empty
                  action={
                    <Link to={user ? '/new' : '/register'} className="btn btn-primary">
                      {t('home.startFirst')}
                    </Link>
                  }
                >
                  {t('home.noThreads')}
                </Empty>
              ) : (
                <>
                  <div className="rows">
                    {threads.data.map((t) => (
                      <ThreadRow key={t.id} thread={t} showCategory />
                    ))}
                  </div>
                  <Pagination page={threads.page} totalPages={threads.totalPages} onPage={setPage} />
                </>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
