import { useEffect, useState } from 'react';
import { apiRpc } from '../../utils/api';

const STORAGE_KEY = 'n9_dismissed_banners';

function isDismissed(id) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const ts = data[id];
    if (!ts) return false;
    return Date.now() - ts < 86400000;
  } catch {
    return false;
  }
}

function markDismissed(id) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[id] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* */ }
}

export default function PopupBanner() {
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    apiRpc('get_active_popup_banners', {}).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      const active = arr.find((b) => !isDismissed(b.id));
      if (active) setBanner(active);
    }).catch(() => {});
  }, []);

  if (!banner) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => setBanner(null)}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {banner.link_url ? (
          <a href={banner.link_url} target="_blank" rel="noopener noreferrer">
            <img src={banner.image_url} alt={banner.title || ''} className="max-w-full max-h-[80vh] object-contain rounded-2xl" />
          </a>
        ) : (
          <img src={banner.image_url} alt={banner.title || ''} className="max-w-full max-h-[80vh] object-contain rounded-2xl" />
        )}
        <button
          onClick={() => { markDismissed(banner.id); setBanner(null); }}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 text-sm font-bold"
        >✕</button>
        {banner.title && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-8 rounded-b-2xl">
            <p className="text-white text-sm font-semibold">{banner.title}</p>
          </div>
        )}
      </div>
    </div>
  );
}
