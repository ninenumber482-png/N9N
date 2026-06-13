import { useEffect, useState } from 'react';

const DIGITS = ['9', '3', '1', '7', '9', '5', '2', '8', '9', '4', '6', '9'];

export default function MaintenancePage({ message }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1200);
    return () => clearInterval(id);
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

      {/* Center card */}
      <div style={styles.card}>
        {/* Status pill */}
        <div style={styles.statusRow}>
          <span style={{ ...styles.dot, animationDelay: `${tick * 0}s` }} />
          <span style={styles.statusText}>SISTEM OFFLINE</span>
        </div>

        {/* Logo */}
        <img
          src="/assets/img/number9-logo.png"
          alt="NUMBER9"
          style={styles.logo}
          onError={e => { e.target.style.display = 'none'; }}
        />

        {/* Headline */}
        <h1 style={styles.headline}>UNDER<br />MAINTENANCE</h1>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerGlyph}>◆</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Message */}
        <p style={styles.message}>
          {message || 'Platform sedang dalam pemeliharaan terjadwal.\nLayanan akan kembali segera.'}
        </p>

        {/* Info grid */}
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>STATUS</span>
            <span style={styles.infoValue}>MAINTENANCE</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>AKSES</span>
            <span style={styles.infoValue}>TERKUNCI</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>DATA</span>
            <span style={styles.infoValue}>AMAN</span>
          </div>
        </div>

        {/* Footer note */}
        <p style={styles.footer}>
          Halaman ini akan otomatis membuka kembali saat maintenance selesai.
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');

        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes floatDrift {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-18px) rotate(2deg); }
          66% { transform: translateY(10px) rotate(-1deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
          50% { opacity: 0.5; box-shadow: 0 0 0 8px rgba(245,158,11,0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
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
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)',
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
  card: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '3rem 2.5rem',
    maxWidth: '480px',
    width: '90%',
    border: '1px solid rgba(245,158,11,0.15)',
    background: 'linear-gradient(145deg, rgba(10,10,12,0.98) 0%, rgba(18,14,8,0.98) 100%)',
    boxShadow: '0 0 80px rgba(245,158,11,0.06), inset 0 1px 0 rgba(245,158,11,0.08)',
    animation: 'fadeUp 0.7s ease both',
    backdropFilter: 'blur(20px)',
    borderRadius: '2px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  dot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#f59e0b',
    animation: 'pulse 1.8s ease-in-out infinite',
  },
  statusText: {
    fontSize: '0.65rem',
    fontWeight: 500,
    letterSpacing: '0.25em',
    color: '#f59e0b',
  },
  logo: {
    height: '36px',
    width: 'auto',
    filter: 'brightness(0) invert(1)',
    opacity: 0.9,
    animation: 'fadeUp 0.7s 0.1s ease both',
  },
  headline: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 'clamp(3rem, 10vw, 5rem)',
    lineHeight: 0.9,
    letterSpacing: '0.04em',
    textAlign: 'center',
    color: '#ffffff',
    margin: 0,
    backgroundImage: 'linear-gradient(135deg, #fff 40%, rgba(245,158,11,0.6) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'fadeUp 0.7s 0.2s ease both',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    animation: 'fadeUp 0.7s 0.3s ease both',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.3), transparent)',
  },
  dividerGlyph: {
    fontSize: '0.5rem',
    color: '#f59e0b',
    opacity: 0.5,
  },
  message: {
    fontSize: '0.8rem',
    lineHeight: 1.7,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    margin: 0,
    animation: 'fadeUp 0.7s 0.4s ease both',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    width: '100%',
    background: 'rgba(245,158,11,0.08)',
    border: '1px solid rgba(245,158,11,0.08)',
    animation: 'fadeUp 0.7s 0.5s ease both',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.875rem 0.5rem',
    background: 'rgba(5,6,7,0.8)',
  },
  infoLabel: {
    fontSize: '0.55rem',
    letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.3)',
  },
  infoValue: {
    fontSize: '0.65rem',
    fontWeight: 500,
    letterSpacing: '0.1em',
    color: '#f59e0b',
  },
  footer: {
    fontSize: '0.65rem',
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    letterSpacing: '0.05em',
    margin: 0,
    lineHeight: 1.6,
    animation: 'fadeUp 0.7s 0.6s ease both',
  },
};
