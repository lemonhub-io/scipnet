// Google Analytics 4 (gtag.js) — lazy, typed, SPA-aware.
// The script is injected async in production only; default page_view tracking
// is disabled so route changes can be reported explicitly via trackPageview().

type Gtag = (command: 'config' | 'event' | 'js', ...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: IArguments[] | unknown[];
    gtag?: Gtag;
  }
}

const MEASUREMENT_ID = 'G-2HHNX0NWDT';
let initialized = false;

export function initAnalytics(): void {
  if (initialized || !import.meta.env.PROD) return;
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  const gtag: Gtag = (...args) => {
    window.dataLayer!.push(args);
  };
  window.gtag = gtag;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

/** Report a navigation — call once per React Router location change. */
export function trackPageview(path: string): void {
  window.gtag?.('event', 'page_view', { page_path: path, page_title: document.title });
}
