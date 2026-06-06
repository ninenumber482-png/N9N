import { useEffect, useState, useCallback } from 'react';
import { apiRpc } from '../../utils/api';

const DISMISS_TTL = 24 * 60 * 60 * 1000; // 24 jam
const STORAGE_KEY = 'n9_dismissed_banners';

function getDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(data).filter(([, ts]) => now - ts < DISMISS_TTL)
    );
  } catch {
    return {};
  }
}

function dismissBanner(id) {
  try {
    const current = getDismissed();
    current[id] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch { /* ignore */ }
}

export default function PopupBanner() {
  const [banners, setBanners] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const dismissed = getDismissed();
    apiRpc('get_active_popup_banners', {})
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        const filtered = arr.filter((b) => !dismissed[b.id]);
        if (filtered.length > 0) {
          setBanners(filtered);
          setCurrentIdx(0);
          setTimeout(() => setVisible(true), 500);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const dismiss = useCallback(() => {
    if (banners[currentIdx]) dismissBanner(banners[currentIdx].id);
    if (currentIdx < banners.length - 1) {
      setCurrentIdx((i) => i + 1);
      setImgLoaded(false);
      setTimeout(() => setVisible(true), 300);
    } else {
      setVisible(false);
    }
  }, [banners, currentIdx]);

  if (!visible || banners.length === 0) return null;

  const banner = banners[currentIdx];
  const hasNext = currentIdx < banners.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {banner.link_url ? (
          <a href={banner.link_url} target="_blank" rel="noopener noreferrer">
            <img
              src={banner.image_url}
              alt={banner.title || 'Popup Banner'}
              className={`max-w-full max-h-[80vh] object-contain transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
            />
          </a>
        ) : (
          <img
            src={banner.image_url}
            alt={banner.title || 'Popup Banner'}
            className={`max-w-full max-h-[80vh] object-contain transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
          />
        )}

        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={dismiss}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition text-sm font-bold"
            title={hasNext ? 'Lanjut' : 'Tutup'}
          >
            {hasNext ? '>' : '✕'}
          </button>
        </div>

        {banner.title && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-8">
            <p className="text-white text-sm font-semibold">{banner.title}</p>
          </div>
        )}
      </div>
    </div>
  );
}
