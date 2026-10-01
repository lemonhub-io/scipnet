import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerSW } from 'virtual:pwa-register';

/** SW registration + offline status chrome. Renders nothing when all is well. */
export function Pwa() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<(reload?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    updateRef.current = registerSW({
      immediate: true,
      onOfflineReady() {
        setOfflineReady(true);
        setTimeout(() => setOfflineReady(false), 4500);
      },
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
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
