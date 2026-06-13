import { useEffect } from 'react';

const DIGITS = ['9', '3', '1', '7', '9', '5', '2', '8', '9', '4', '6', '9'];

export default function MaintenancePage({ message }) {
  // Block right-click, text-select, and common escape shortcuts
  useEffect(() => {
    const block = e => e.preventDefault();
    const blockKey = e => {
      if (e.key === 'F12' || (e.ctrlKey && ['u','s','a','c'].includes(e.key.toLowerCase()))) e.preventDefault();
    };
    document.addEventListener('contextmenu', block);
    document.addEventListener('keydown', blockKey);
    document.addEventListener('selectstart', block);
    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('keydown', blockKey);
      document.removeEventListener('selectstart', block);
    };
  }, []);

  return (
    <div style={styles.root}>
      {/* Scanline overlay */}
      <div style={styles.scanlines} />

      {/* Floating digit atmosphere */}
      <div style={styles.digitField} aria-hidden="true">
        {DIGITS.map((d, i) => (
          <span key={i} style={{
            ...styles.floatDigit,
            left: `${(i * 8.3) % 95}%`,
            top: `${(i * 13 + 7) % 85}%`,
            animationDelay: `${i * 0.4}s`,
            fontSize: i % 3 === 0 ? '7rem' : i % 3 === 1 ? '4rem' : '10rem',
            opacity: i % 3 === 0 ? 0.03 : 0.02,
          }}>{d}</span>
        ))}
      </div>

      {/* Center content — flat, no card box */}
      <div style={styles.wrap}>
        {/* Status pill */}
        <div style={styles.statusRow}>
          <span style={styles.dot} />
          <span style={styles.statusText}>SISTEM OFFLINE</span>
        </div>

        {/* Logo */}
        <img
          src="/assets/img/number9-logo.png"
          alt="NUMBER9"
          style={styles.logo}
          onError={e => { e.target.style.display = 'none'; }}
          draggable="false"
        />

        {/* Headline */}
        <h1 style={styles.headline}>UNDER<br />MAINTENANCE</h1>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerGlyph}>◆</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Message — strip any time estimates */}
        <p style={styles.message}>
          {message
            ? message
                .replace(/[Kk]embali dalam[^.!?\n]*/g, '')
                .replace(/(\d+|beberapa|sebentar)\s*(menit|jam|hari|minutes?|hours?)[^.!?\n]*/gi, '')
                .replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim()
            : 'Platform sedang dalam pemeliharaan.\nLayanan akan segera kembali.'}
        </p>

        {/* Info grid */}
        <div style={styles.infoGrid}>
          {[['STATUS','MAINTENANCE'],['AKSES','TERKUNCI'],['DATA','AMAN']].map(([label, val]) => (
            <div key={label} style={styles.infoItem}>
              <span style={styles.infoLabel}>{label}</span>
              <span style={styles.infoValue}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');
        @keyframes floatDrift {
          0%,100% { transform: translateY(0) rotate(0deg); }
          33%      { transform: translateY(-16px) rotate(2deg); }
          66%      { transform: translateY(9px) rotate(-1deg); }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.4; }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#050607',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'DM Mono', monospace",
    overflow: 'hidden',
    zIndex: 9999,
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.012) 2px,rgba(255,255,255,0.012) 4px)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  digitField: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 0,
  },
  floatDigit: {
    position: 'absolute',
    fontFamily: "'Bebas Neue', sans-serif",
    color: '#f59e0b',
    lineHeight: 1,
    animation: 'floatDrift 8s ease-in-out infinite',
    userSelect: 'none',
  },
  // flat — no card border, no box-shadow, no background panel
  wrap: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.85rem',
    maxWidth: '400px',
    width: '88%',
    animation: 'fadeUp 0.6s ease both',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
  },
  dot: {
    display: 'inline-block',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#f59e0b',
    animation: 'pulse 1.8s ease-in-out infinite',
  },
  statusText: {
    fontSize: '0.6rem',
    fontWeight: 500,
    letterSpacing: '0.28em',
    color: '#f59e0b',
  },
  logo: {
    height: '38px',
    width: 'auto',
    draggable: false,
    animation: 'fadeUp 0.6s 0.1s ease both',
  },
  headline: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 'clamp(3rem, 10vw, 5rem)',
    lineHeight: 0.88,
    letterSpacing: '0.04em',
    textAlign: 'center',
    margin: 0,
    backgroundImage: 'linear-gradient(135deg, #fff 40%, rgba(245,158,11,0.55) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'fadeUp 0.6s 0.15s ease both',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.25), transparent)',
  },
  dividerGlyph: {
    fontSize: '0.45rem',
    color: '#f59e0b',
    opacity: 0.45,
  },
  message: {
    fontSize: '0.75rem',
    lineHeight: 1.75,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    margin: 0,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    width: '100%',
    background: 'rgba(245,158,11,0.07)',
    border: '1px solid rgba(245,158,11,0.07)',
    marginTop: '0.25rem',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.2rem',
    padding: '0.55rem 0.4rem',
    background: 'rgba(5,6,7,0.9)',
  },
  infoLabel: {
    fontSize: '0.5rem',
    letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.25)',
  },
  infoValue: {
    fontSize: '0.6rem',
    fontWeight: 500,
    letterSpacing: '0.1em',
    color: '#f59e0b',
  },
};
