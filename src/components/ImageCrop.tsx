import { useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { useTranslation } from 'react-i18next';
import { WEBP_QUALITY, cropToWebP } from '../image';
import { apiErr } from '../api';

interface Props {
  /** Object URL for the picked image — created by the caller, revoked in onDone. */
  src: string;
  /** Original filename — the output keeps its stem with a .webp extension. */
  name: string;
  /** Fixed crop aspect (e.g. 1 for ID photos); omit to offer presets. */
  aspect?: number;
  /** Called with the transcoded File, or null on abort. */
  onDone: (file: File | null) => void;
}

const ASPECT_PRESETS: { key: string; ratio: number | null }[] = [
  { key: 'native', ratio: null },
  { key: '1:1', ratio: 1 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '16:9', ratio: 16 / 9 },
];

export function ImageCropModal({ src, name, aspect, onDone }: Props) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [preset, setPreset] = useState(0);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = aspect ?? ASPECT_PRESETS[preset].ratio ?? naturalRatio ?? 4 / 3;

  const confirm = async () => {
    if (!area || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await cropToWebP(src, area, rotation, name);
      onDone(out);
    } catch (e) {
      setError(apiErr(e));
      setBusy(false);
    }
  };

  return (
    <div className="crop-scrim" role="dialog" aria-modal="true" aria-label={t('crop.title')}>
      <div className="crop-modal">
        <div className="crop-head">
          <span className="eyebrow">{t('crop.title')}</span>
          <span className="crop-file">{name}</span>
        </div>

        <div className="crop-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={resolved}
            minZoom={1}
            maxZoom={5}
            zoomSpeed={0.5}
            cropShape="rect"
            showGrid
            restrictPosition
            style={{
              cropAreaStyle: { border: '1px solid #a01010', color: 'rgba(20, 20, 18, 0.55)' },
            }}
            classes={{}}
            mediaProps={{}}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, px) => setArea(px)}
            onMediaLoaded={(m) => setNaturalRatio(m.naturalWidth / m.naturalHeight)}
          />
        </div>

        <div className="crop-controls">
          <span className="crop-label">{t('crop.zoom')}</span>
          <input
            className="crop-zoom"
            type="range"
            min={1}
            max={5}
            step={0.05}
            value={zoom}
            aria-label={t('crop.zoom')}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <button
            type="button"
            className="btn-quiet"
            title={t('crop.rotate')}
            aria-label={t('crop.rotate')}
            onClick={() => setRotation((r) => (r + 270) % 360)}
          >
            ↺
          </button>
          <button
            type="button"
            className="btn-quiet"
            title={t('crop.rotate')}
            aria-label={t('crop.rotate')}
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            ↻
          </button>
          {aspect === undefined && (
            <>
              <span className="crop-label">{t('crop.aspect')}</span>
              <span className="chip-row" style={{ gap: 6 }}>
                {ASPECT_PRESETS.map((p, i) => (
                  <button
                    type="button"
                    key={p.key}
                    className={`chip chip-sm${preset === i ? ' active' : ''}`}
                    aria-pressed={preset === i}
                    onClick={() => setPreset(i)}
                  >
                    {p.key === 'native' ? t('crop.native') : p.key}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>

        <div className="crop-foot">
          <span className="crop-out">
            {t('crop.output')}: WEBP · Q{Math.round(WEBP_QUALITY * 100)}
            {area ? ` · ${Math.round(area.width)}×${Math.round(area.height)}` : ''}
          </span>
          {error && <span className="crop-err">{error}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-quiet" onClick={() => onDone(null)} disabled={busy}>
            {t('crop.cancel')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm} disabled={!area || busy}>
            {busy ? t('crop.working') : t('crop.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
