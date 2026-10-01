import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import type { Category as CategoryT, Page, ThreadSummary } from '../../shared/api-types';
import { catDesc, catName } from '../i18n';
import { Empty, ErrorBox, Loading, Pagination } from '../components/Ui';
import { ThreadRow } from '../components/ThreadRow';
import { useAuth } from '../auth';

export default function Category() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') === 'top' ? 'top' : 'new';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);

  const [category, setCategory] = useState<CategoryT | null>(null);
  const [threads, setThreads] = useState<Page<ThreadSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setCategory(null);
    setNotFound(false);
    api
      .categories()
      .then(({ categories }) => {
        const c = categories.find((x) => x.slug === slug);
        if (c) setCategory(c);
        else setNotFound(true);
      })
      .catch((e) => setError(apiErr(e)));
  }, [slug]);

  useEffect(() => {
    setThreads(null);
    api
      .threads({ category: slug, sort, page, limit: 20 })
      .then(setThreads)
      .catch((e) => setError(apiErr(e)));
  }, [slug, sort, page]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  if (notFound) {
    return (
      <div className="wrap section">
        <Empty action={<Link to="/" className="btn btn-primary">{t('ui.back')}</Link>}>
          {t('cat.notFound', { slug })}
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="subnav">
        <div className="subnav-inner">
          <Link to="/" className="caption muted" style={{ textDecoration: 'none' }}>
            ←
          </Link>
          <span className="subnav-title">{category ? catName(t, category) : '…'}</span>
          <span className="subnav-spacer" />
          {category &&
            (user?.role === 'admin' || category.memberPost ? (
              <Link to={user ? `/new?category=${slug}` : '/signin'} className="btn btn-primary btn-sm">
                {t('nav.newThread')}
              </Link>
            ) : (
              <span className="pin-badge badge-red">{t('cat.restricted')}</span>
            ))}
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="wrap">
          {category?.description && (
            <p className="lead" style={{ margin: '0 0 24px', fontSize: 17 }}>
              {catDesc(t, category)}
            </p>
          )}

          <div className="chip-row" style={{ marginBottom: 20 }}>
            <button className={`chip${sort === 'new' ? ' active' : ''}`} onClick={() => setParam('sort', 'new')}>
              {t('cat.latest')}
            </button>
            <button className={`chip${sort === 'top' ? ' active' : ''}`} onClick={() => setParam('sort', 'top')}>
              {t('cat.top')}
            </button>
          </div>

          {error && <ErrorBox message={error} />}
          {!threads ? (
            <Loading />
          ) : threads.data.length === 0 ? (
            <Empty
              action={
                category && user?.role !== 'admin' && !category.memberPost ? (
                  <span className="pin-badge badge-red">{t('cat.restricted')}</span>
                ) : (
                  <Link to={user ? `/new?category=${slug}` : '/signin'} className="btn btn-primary">
                    {t('home.startFirst')}
                  </Link>
                )
              }
            >
              {t('cat.noThreads', { name: category ? catName(t, category) : t('cat.thisTopic') })}
            </Empty>
          ) : (
            <>
              <div className="rows">
                {threads.data.map((t) => (
                  <ThreadRow key={t.id} thread={t} />
                ))}
              </div>
              <Pagination page={threads.page} totalPages={threads.totalPages} onPage={(p) => setParam('page', String(p))} />
            </>
          )}
        </div>
      </section>
    </>
  );
}
