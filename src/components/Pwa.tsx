import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerSW } from 'virtual:pwa-register';
import { isStandalone } from '../pwa';

/** SW registration + offline status chrome. Renders nothing when all is well. */
export function Pwa() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<(reload?: boolean) => Promise<void>>(async () => {});
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const update = registerSW({
      immediate: true,
      onOfflineReady() {
        setOfflineReady(true);
        setTimeout(() => setOfflineReady(false), 4500);
      },
      onNeedRefresh() {
        // Installed PWA: ask before swapping in the new build.
        // In a plain browser tab keep the old behavior — update silently.
        if (isStandalone()) setNeedRefresh(true);
        else void update(true);
      },
      onRegisteredSW(_url, reg) {
        // 'prompt' mode doesn't poll — check for new builds hourly and
        // whenever the app returns to the foreground.
        if (!reg) return;
        const tick = setInterval(() => void reg.update(), 60 * 60 * 1000);
        const onVis = () => {
          if (document.visibilityState === 'visible') void reg.update();
        };
        document.addEventListener('visibilitychange', onVis);
        cleanupRef.current = () => {
          clearInterval(tick);
          document.removeEventListener('visibilitychange', onVis);
        };
      },
    });
    updateRef.current = update;
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      cleanupRef.current?.();
    };
  }, []);

  return (
    <>
      {offline && (
        <div className="pwa-bar" role="alert">
          <span className="pwa-dot" aria-hidden="true" />
          {t('pwa.offline')}
        </div>
      )}
      {offlineReady && !offline && (
        <div className="pwa-toast" role="status">
          {t('pwa.offlineReady')}
        </div>
      )}
      {needRefresh && (
        <div className="pwa-toast" role="status">
          <span>{t('pwa.newBuild')}</span>
          <button onClick={() => void updateRef.current(true)}>{t('pwa.reload')}</button>
          <button onClick={() => setNeedRefresh(false)}>{t('pwa.dismiss')}</button>
        </div>
      )}
    </>
  );
}
