import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import type { Page, Reply, Thread as ThreadT } from '../../shared/api-types';
import { catName } from '../i18n';
import { Avatar } from '../components/Avatar';
import { ImageCropModal } from '../components/ImageCrop';
import { PostBody } from '../components/PostBody';
import { docNum } from '../components/ThreadRow';
import { TimeAgo } from '../components/TimeAgo';
import { Empty, ErrorBox, Loading, Pagination } from '../components/Ui';
import { useAuth } from '../auth';

const filedDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default function Thread() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [thread, setThread] = useState<ThreadT | null>(null);
  const [replies, setReplies] = useState<Page<Reply> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [crop, setCrop] = useState<{ src: string; name: string } | null>(null);

  const loadReplies = useCallback(
    (p: number) => {
      api.replies(id, p).then(setReplies).catch((e) => setError(apiErr(e)));
    },
    [id],
  );

  useEffect(() => {
    setThread(null);
    setReplies(null);
    setNotFound(false);
    api
      .thread(id)
      .then(({ thread }) => setThread(thread))
      .catch((e) => (e.status === 404 ? setNotFound(true) : setError(apiErr(e))));
    loadReplies(1);
    setPage(1);
  }, [id, loadReplies]);

  const like = async () => {
    if (!user || !thread) return;
    try {
      const { liked, likeCount } = await api.toggleLike(thread.id);
      setThread({ ...thread, likedByMe: liked, likeCount });
    } catch (e) {
      setError(apiErr(e));
    }
  };

  const removeThread = async () => {
    if (!thread || !confirm(t('thread.confirmDelThread'))) return;
    await api.deleteThread(thread.id);
    navigate(`/c/${thread.category.slug}`);
  };

  const removeReply = async (rid: string) => {
    if (!confirm(t('thread.confirmDelReply'))) return;
    await api.deleteReply(rid);
    loadReplies(page);
    if (thread) setThread({ ...thread, replyCount: Math.max(0, thread.replyCount - 1) });
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setAttachBusy(true);
    try {
      const r = await api.uploadAttachment(file);
      setDraft((d) => `${d}${d.endsWith('\n') || d === '' ? '' : '\n\n'}${r.url}\n`);
    } catch (e) {
      setFormError(apiErr(e));
    } finally {
      setAttachBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || !draft.trim()) return;
    setPosting(true);
    setFormError(null);
    try {
      await api.createReply(thread.id, draft.trim());
      setDraft('');
      loadReplies(page);
      setThread({ ...thread, replyCount: thread.replyCount + 1 });
    } catch (e) {
      setFormError(apiErr(e));
    } finally {
      setPosting(false);
    }
  };

  if (notFound) {
    return (
      <div className="read section">
        <Empty action={<Link to="/" className="btn btn-primary">{t('ui.back')}</Link>}>
          {t('thread.notFound')}
        </Empty>
      </div>
    );
  }

  if (!thread) {
    return error ? (
      <div className="read section"><ErrorBox message={error} /></div>
    ) : (
      <Loading />
    );
  }

  const mine = user && (user.id === thread.author.id || user.role === 'admin');

  return (
    <>
      <div className="subnav">
        <div className="subnav-inner">
          <Link to={`/c/${thread.category.slug}`} className="caption muted" style={{ textDecoration: 'none' }}>
            ← {catName(t, thread.category)}
          </Link>
          <span className="subnav-spacer" />
          {thread.locked && <span className="pin-badge badge-red">{t('thread.locked')}</span>}
        </div>
      </div>

      <div className="read">
        <div className="thread-head">
          <div className="doc-meta">
            <span>
              {t('thread.itemNo')}: <span className="docnum">{docNum(thread.docNum)}</span>
            </span>
            <span>
              {t('thread.dept')}: {catName(t, thread.category)}
            </span>
            <span className={thread.locked ? 'red' : ''}>
              {t('thread.clearance')}: {thread.locked ? t('thread.locked') : t('thread.clearanceLevel')}
            </span>
            <span>
              {t('thread.filed')}: {filedDate(thread.createdAt)}
            </span>
          </div>
          <h1 className="display-lg thread-title">{thread.title}</h1>
          <div className="thread-meta">
            <Avatar user={thread.author} size="xs" />
            <Link to={`/u/${thread.author.username}`}>{thread.author.displayName}</Link>
            <span aria-hidden>·</span>
            <TimeAgo ts={thread.createdAt} />
            {thread.updatedAt > thread.createdAt + 60_000 && (
              <>
                <span aria-hidden>·</span>
                <span>{t('thread.edited')} <TimeAgo ts={thread.updatedAt} /></span>
              </>
            )}
          </div>
        </div>

        <PostBody body={thread.body} />

        <div className="thread-actions">
          <button
            className={`like-btn${thread.likedByMe ? ' liked' : ''}`}
            onClick={like}
            title={user ? (thread.likedByMe ? t('thread.unlike') : t('thread.like')) : t('thread.signInToLike')}
          >
            {t('thread.rating')} +{thread.likeCount}
          </button>
          <span style={{ flex: 1 }} />
          {mine && (
            <>
              <Link to={`/new?edit=${thread.id}`} className="btn-quiet">
                {t('thread.edit')}
              </Link>
              <button className="btn-quiet" onClick={removeThread}>
                {t('thread.del')}
              </button>
            </>
          )}
        </div>

        <div className="replies-head">
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>
              {t('thread.itemNo')} {docNum(thread.docNum)} /// {t('thread.addenda')}
            </span>
            <h2 className="display-md">
              {thread.replyCount === 0
                ? t('thread.noReplies')
                : `${t('thread.addenda')} (${thread.replyCount})`}
            </h2>
          </div>
        </div>

        {!replies ? (
          <Loading />
        ) : replies.data.length === 0 ? (
          <p className="muted" style={{ padding: '24px 0' }}>
            {t('thread.beFirst')}
          </p>
        ) : (
          <>
            <div>
              {replies.data.map((r, i) => (
                <div className="reply" key={r.id}>
                  <Avatar user={r.author} />
                  <div className="reply-body">
                    <div className="reply-meta">
                      <span className="addendum-num">
                        ADD {docNum(thread.docNum)}.{String((replies.page - 1) * replies.perPage + i + 1).padStart(3, '0')}
                      </span>
                      <Link to={`/u/${r.author.username}`}>{r.author.displayName}</Link>
                      <TimeAgo ts={r.createdAt} />
                      <span className="reply-actions">
                        {user && (user.id === r.author.id || user.role === 'admin') && (
                          <button className="btn-quiet" onClick={() => removeReply(r.id)}>
                            {t('thread.del')}
                          </button>
                        )}
                      </span>
                    </div>
                    <PostBody body={r.body} />
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={replies.page}
              totalPages={replies.totalPages}
              onPage={(p) => {
                setPage(p);
                loadReplies(p);
              }}
            />
          </>
        )}

        <div style={{ padding: '8px 0 80px' }}>
          {thread.locked ? (
            <div className="notice">{t('thread.lockedNotice')}</div>
          ) : user ? (
            <form className="composer" onSubmit={submit}>
              {preview ? (
                <div className="md-preview">
                  <PostBody body={draft} />
                </div>
              ) : (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('thread.replyPh')}
                  aria-label={t('thread.reply')}
                />
              )}
              <div className="composer-foot">
                <span className="hint">{t('thread.replyHint')}</span>
                <button type="button" className="btn-quiet" onClick={() => setPreview((v) => !v)}>
                  {preview ? t('new.write') : t('new.preview')}
                </button>
                <label className="btn-quiet" style={{ cursor: 'pointer' }}>
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
                <button type="submit" className="btn btn-primary btn-sm" disabled={posting || !draft.trim()}>
                  {posting ? t('thread.posting') : t('thread.reply')}
                </button>
              </div>
              {formError && <div style={{ marginTop: 10 }}><ErrorBox message={formError} /></div>}
            </form>
          ) : (
            <div className="notice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{t('thread.signInJoin')}</span>
              <Link to="/signin" className="btn btn-primary btn-sm">
                {t('nav.signIn')}
              </Link>
            </div>
          )}
        </div>
      </div>

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
    </>
  );
}
