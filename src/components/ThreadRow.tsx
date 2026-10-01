import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ThreadSummary } from '../../shared/api-types';
import { catName } from '../i18n';
import { Avatar } from './Avatar';
import { TimeAgo } from './TimeAgo';

/** SCP-XXXX style document number derived from the thread's sequential rowid. */
export const docNum = (n: number) => `SCP-${String(Math.max(0, n)).padStart(4, '0')}`;

export function ThreadRow({ thread, showCategory }: { thread: ThreadSummary; showCategory?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to={`/t/${thread.id}`} className="row">
      <span className="docnum">{docNum(thread.docNum)}</span>
      <div className="row-main">
        <div className="row-title">
          {thread.pinned && <span className="pin-badge">{t('thread.pinned')}</span>}
          {thread.locked && <span className="pin-badge badge-red">{t('thread.locked')}</span>}
          <span>{thread.title}</span>
        </div>
        <div className="row-sub">
          <Avatar user={thread.author} size="xs" />
          <span>{thread.author.displayName}</span>
          <span aria-hidden>·</span>
          <TimeAgo ts={thread.updatedAt} />
          {showCategory && (
            <>
              <span aria-hidden>·</span>
              <span>{catName(t, thread.category)}</span>
            </>
          )}
        </div>
      </div>
      <div className="row-side">
        <span className="row-count hide-s" title={t('thread.like')}>
          <strong>+{thread.likeCount}</strong> {t('thread.rating')}
        </span>
        <span className="row-count" title={t('thread.reply')}>
          <strong>{thread.replyCount}</strong> {t('count.replies', { count: thread.replyCount })}
        </span>
      </div>
    </Link>
  );
}
