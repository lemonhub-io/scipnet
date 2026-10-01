import type { PublicUser } from '../../shared/api-types';

export function Avatar({ user, size }: { user: Pick<PublicUser, 'displayName' | 'username' | 'avatarUrl'>; size?: 'xs' | 'lg' }) {
  const cls = `avatar${size === 'xs' ? ' avatar-xs' : ''}${size === 'lg' ? ' avatar-lg' : ''}`;
  if (user.avatarUrl) {
    return (
      <span className={cls} aria-hidden>
        <img src={user.avatarUrl} alt="" loading="lazy" />
      </span>
    );
  }
  const initial = (user.displayName || user.username || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={cls} aria-hidden>
      {initial}
    </span>
  );
}
