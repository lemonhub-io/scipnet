import { useTranslation } from 'react-i18next';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function timeAgo(ts: number, locale: string, justNow: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  if (abs < MIN) return justNow;
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < WEEK) return rtf.format(Math.round(diff / DAY), 'day');
  return new Date(ts).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: ts < Date.now() - 365 * DAY ? 'numeric' : undefined,
  });
}

export function TimeAgo({ ts }: { ts: number }) {
  const { t, i18n } = useTranslation();
  return (
    <time dateTime={new Date(ts).toISOString()} title={new Date(ts).toLocaleString(i18n.language)}>
      {timeAgo(ts, i18n.language, t('time.justNow'))}
    </time>
  );
}
