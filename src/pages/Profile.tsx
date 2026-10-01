import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiErr } from '../api';
import type { Page, ThreadSummary, UserProfile } from '../../shared/api-types';
import { Avatar } from '../components/Avatar';
import { ImageCropModal } from '../components/ImageCrop';
import { ThreadRow } from '../components/ThreadRow';
import { Empty, ErrorBox, Loading, Pagination } from '../components/Ui';
import { needsInstallForPush, pushState, enablePush, disablePush } from '../push';
import type { PushState } from '../push';
import { useAuth } from '../auth';

export default function Profile() {
  const { username = '' } = useParams();
  const { user: me, setUser } = useAuth();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [threads, setThreads] = useState<Page<ThreadSummary> | null>(null);
  const [, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ src: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);

  const loadThreads = useCallback(
    (p: number) => api.userThreads(username, p).then(setThreads).catch(() => setThreads(null)),
    [username],
  );

  useEffect(() => {
    setProfile(null);
    setNotFound(false);
    api
      .user(username)
      .then(({ user }) => {
        setProfile(user);
        setDisplayName(user.displayName);
        setBio(user.bio);
      })
      .catch((e) => (e.status === 404 ? setNotFound(true) : setError(apiErr(e))));
    setPage(1);
    loadThreads(1);
    pushState().then(setPush);
  }, [username, loadThreads]);

  if (notFound) {
    return (
      <div className="read section">
        <Empty action={<Link to="/" className="btn btn-primary">{t('ui.back')}</Link>}>
          {t('profile.notFound', { username })}
        </Empty>
      </div>
    );
  }
  if (!profile) return error ? <div className="read section"><ErrorBox message={error} /></div> : <Loading />;

  const isMe = me?.id === profile.id;

  const save = async () => {
    setSaveError(null);
    try {
      const { user } = await api.updateMe({ displayName: displayName.trim() || undefined, bio });
      setProfile({ ...profile, ...user });
      setUser(user);
      setEditing(false);
    } catch (e) {
      setSaveError(apiErr(e));
    }
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setSaveError(null);
    try {
      const r = await api.uploadAvatar(file);
      const updated = { ...profile, avatarUrl: r.url };
      setProfile(updated);
      if (me) setUser({ ...me, avatarUrl: r.url });
    } catch (e) {
      setSaveError(apiErr(e));
    }
  };

  return (
    <div className="read" style={{ paddingTop: 72, paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 40 }}>
        <Avatar user={profile} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">{t('profile.personnelFile')}</span>
          <h1 className="display-md">{profile.displayName}</h1>
          <div className="caption muted" style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 12 }}>
            @{profile.username}
            {profile.role === 'admin' && (
              <span className="pin-badge badge-red" style={{ marginLeft: 8 }}>
                {t('profile.staff')}
              </span>
            )}
          </div>
          {profile.bio && !editing && <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5 }}>{profile.bio}</p>}
        </div>
        {isMe && !editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {t('profile.edit')}
          </button>
        )}
      </div>

      {editing && (
        <div className="composer" style={{ marginBottom: 40 }}>
          <div className="field">
            <label htmlFor="dn">{t('profile.display')}</label>
            <input id="dn" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="bio">{t('profile.bio')}</label>
            <textarea
              id="bio"
              className="textarea"
              style={{ minHeight: 90 }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              placeholder={t('profile.bioPh')}
            />
          </div>
          <div className="composer-foot">
            <button className="btn-quiet" onClick={() => fileRef.current?.click()}>
              {t('profile.changeAvatar')}
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setCrop({ src: URL.createObjectURL(f), name: f.name });
              }}
            />
            <button className="btn-quiet" onClick={() => setEditing(false)}>
              {t('profile.cancel')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={save}>
              {t('profile.save')}
            </button>
          </div>
        </div>
      )}
      {saveError && <div style={{ marginBottom: 24 }}><ErrorBox message={saveError} /></div>}

      {isMe && push && push !== 'unsupported' && (
        <div className="notice" style={{ marginBottom: 40, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ margin: 0 }}>{t('push.title')}</span>
          <span className="muted" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
            {push === 'denied'
              ? t('push.denied')
              : push === 'on'
                ? t('push.descOn')
                : needsInstallForPush()
                  ? t('push.iosHint')
                  : t('push.descOff')}
          </span>
          {push !== 'denied' && (
            <>
              {push === 'on' && (
                <button
                  className="btn-quiet"
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushBusy(true);
                    setPushNote(null);
                    try {
                      const r = await api.pushTest();
                      setPushNote(t('push.testSent', { n: r.sent }));
                    } catch {
                      setPushNote(t('push.testFail'));
                    } finally {
                      setPushBusy(false);
                    }
                  }}
                >
                  {t('push.test')}
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                disabled={pushBusy}
                onClick={async () => {
                  setPushBusy(true);
                  setPushNote(null);
                  try {
                    if (push === 'on') {
                      await disablePush();
                      setPush('off');
                    } else {
                      const s = await enablePush((document.documentElement.lang || 'en').startsWith('zh') ? 'zh' : 'en');
                      setPush(s);
                      if (s !== 'on') setPushNote(t('push.testFail'));
                    }
                  } catch {
                    setPushNote(t('push.testFail'));
                  } finally {
                    setPushBusy(false);
                  }
                }}
              >
                {push === 'on' ? t('push.disable') : t('push.enable')}
              </button>
            </>
          )}
          {pushNote && <span className="caption muted">{pushNote}</span>}
        </div>
      )}

      {crop && (
        <ImageCropModal
          src={crop.src}
          name={crop.name}
          aspect={1}
          onDone={(f) => {
            URL.revokeObjectURL(crop.src);
            setCrop(null);
            if (f) void pickAvatar(f);
          }}
        />
      )}

      <div className="section-head">
        <h2 className="display-md">{t('profile.threads')}</h2>
        <span className="caption muted">
          {profile.threadCount} {t('count.threads', { count: profile.threadCount })} · {profile.replyCount} {t('count.replies', { count: profile.replyCount })}
        </span>
      </div>

      {!threads ? (
        <Loading />
      ) : threads.data.length === 0 ? (
        <Empty>{isMe ? t('profile.emptyMe') : t('profile.emptyOther')}</Empty>
      ) : (
        <>
          <div className="rows">
            {threads.data.map((t) => (
              <ThreadRow key={t.id} thread={t} showCategory />
            ))}
          </div>
          <Pagination
            page={threads.page}
            totalPages={threads.totalPages}
            onPage={(p) => {
              setPage(p);
              loadThreads(p);
            }}
          />
        </>
      )}
    </div>
  );
}
