import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import type { Category } from '../../shared/api-types';
import { catName } from '../i18n';
import { ErrorBox, Loading } from '../components/Ui';
import { ImageCropModal } from '../components/ImageCrop';
import { PostBody } from '../components/PostBody';
import { useAuth } from '../auth';

export default function NewThread() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('category') ?? '';
  const editId = params.get('edit');

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categorySlug, setCategorySlug] = useState(preset);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ready, setReady] = useState(!editId);
  const [busy, setBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [crop, setCrop] = useState<{ src: string; name: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    api.categories().then(({ categories }) => {
      setCategories(categories);
      if (!categorySlug && categories.length) {
        const ok = (c: Category) => user?.role === 'admin' || c.memberPost;
        const pre = categories.find((c) => c.slug === preset);
        setCategorySlug(pre && ok(pre) ? preset : (categories.find(ok)?.slug ?? ''));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (!editId) return;
    api
      .thread(editId)
      .then(({ thread }) => {
        setTitle(thread.title);
        setBody(thread.body);
        setCategorySlug(thread.category.slug);
        setReady(true);
      })
      .catch((e) => {
        setError(apiErr(e));
        setReady(true);
      });
  }, [editId]);

  useEffect(() => {
    if (!loading && !user) navigate('/signin', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user || !ready) return <Loading />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !categorySlug) return;
    setBusy(true);
    setError(null);
    try {
      if (editId) {
        const { thread } = await api.updateThread(editId, { title: title.trim(), body: body.trim() });
        navigate(`/t/${thread.id}`);
      } else {
        const { thread } = await api.createThread({ categorySlug, title: title.trim(), body: body.trim() });
        navigate(`/t/${thread.id}`);
      }
    } catch (e) {
      setError(apiErr(e));
      setBusy(false);
    }
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setAttachBusy(true);
    try {
      const r = await api.uploadAttachment(file);
      setBody((d) => `${d}${d.endsWith('\n') || d === '' ? '' : '\n\n'}${r.url}\n`);
    } catch (e) {
      setError(apiErr(e));
    } finally {
      setAttachBusy(false);
    }
  };

  return (
    <div className="read" style={{ paddingTop: 64, paddingBottom: 80 }}>
      <h1 className="display-lg" style={{ marginBottom: 8 }}>
        {editId ? t('new.editTitle') : t('new.newTitle')}
      </h1>
      <p className="muted caption" style={{ margin: '0 0 36px' }}>
        {t('new.sub')}
      </p>

      {!categories ? (
        <Loading />
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label id="topic-label">{t('new.topic')}</label>
            <div className="chip-row" role="radiogroup" aria-labelledby="topic-label">
              {categories.map((c) => {
                const restricted = user.role !== 'admin' && !c.memberPost;
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`chip${categorySlug === c.slug ? ' active' : ''}${restricted ? ' chip-sealed' : ''}`}
                    aria-pressed={categorySlug === c.slug}
                    disabled={!!editId || restricted}
                    title={restricted ? t('new.restrictedChip') : undefined}
                    onClick={() => setCategorySlug(c.slug)}
                  >
                    {catName(t, c)}
                    {restricted && <span className="chip-seal">S·C</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label htmlFor="title">{t('new.title')}</label>
            <input
              id="title"
              className="input input-lg"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('new.titlePh')}
              maxLength={140}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="body" style={{ display: 'flex', alignItems: 'baseline' }}>
              {t('new.body')}
              <button type="button" className="btn-quiet" style={{ marginLeft: 'auto' }} onClick={() => setPreview((v) => !v)}>
                {preview ? t('new.write') : t('new.preview')}
              </button>
            </label>
            {preview ? (
              <div className="md-preview">
                <PostBody body={body} />
              </div>
            ) : (
              <textarea
                id="body"
                className="textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('new.bodyPh')}
              />
            )}
            <span className="hint">{t('new.hint')}</span>
          </div>

          {error && <div style={{ marginBottom: 18 }}><ErrorBox message={error} /></div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !body.trim()}>
              {busy ? t('new.saving') : editId ? t('new.save') : t('new.publish')}
            </button>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              {attachBusy ? t('thread.uploading') : t('thread.attach')}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={attachBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setCrop({ src: URL.createObjectURL(f), name: f.name });
                }}
              />
            </label>
            <span style={{ flex: 1 }} />
            <Link to={editId ? `/t/${editId}` : '/'} className="btn-quiet">
              {t('new.cancel')}
            </Link>
          </div>
        </form>
      )}

      {crop && (
        <ImageCropModal
          src={crop.src}
          name={crop.name}
          onDone={(f) => {
            URL.revokeObjectURL(crop.src);
            setCrop(null);
            if (f) void attach(f);
          }}
        />
      )}
    </div>
  );
}
