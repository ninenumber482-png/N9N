import { useEffect, useRef, useState } from 'react';
import { apiInvoke } from '../../utils/api';
import { useStore } from '../../store/useStore';

export default function PopupBanner() {
  const [banner, setBanner] = useState(null);
  const auth = useStore((s) => s.auth);
  const fetched = useRef(null);

  useEffect(() => {
    const key = auth?.id || '_anon';
    if (fetched.current === key) return;
    fetched.current = key;
    setBanner(null);
    apiInvoke('get-popup-banners', {}).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      if (arr.length > 0) setBanner(arr[0]);
    }).catch(() => {});
  }, [auth?.id]);

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
          onClick={() => setBanner(null)}
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
