/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surfaces (deep, layered near-black) ──────────────────────────────
        ink: {
          DEFAULT: '#08090b',
          950: '#060708',
          900: '#08090b',
          850: '#0b0d10',
          800: '#0e1115',
          750: '#12161b',
          700: '#171c22',
          600: '#1e242c',
          500: '#28303a',
        },
        // ── Signature accent ─────────────────────────────────────────────────
        accent: {
          DEFAULT: '#fa5c29',
          500: '#fa5c29',
        },
        // ── Status semantics (mirrored by STATUS in src/lib/format.ts) ───────
        ok: '#34d399',
        warn: '#fbbf24',
        crit: '#f87171',
        // ── Text ramp ────────────────────────────────────────────────────────
        txt: {
          hi: '#eceef0',
          mid: '#9aa2ab',
          lo: '#5c646d',
          dim: '#353c44',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        micro: '0.18em',
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        'panel-hover': '0 1px 0 rgba(255,255,255,0.06) inset, 0 30px 60px -28px rgba(0,0,0,0.95)',
        'glow-accent': '0 0 0 1px rgba(250,92,41,0.35), 0 0 28px -6px rgba(250,92,41,0.55)',
      },
      backgroundImage: {
        'accent-sheen': 'linear-gradient(135deg, #ff7a4d 0%, #fa5c29 45%, #e8480f 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'spin-slow': {
          '100%': { transform: 'rotate(360deg)' },
        },
        'live-ping': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.6s ease both',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        'live-ping': 'live-ping 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
