/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
        // ── Signature accent (kept from the original brand) ──────────────────
        accent: {
          DEFAULT: '#fa5c29',
          300: '#ff9a76',
          400: '#ff7a4d',
          500: '#fa5c29',
          600: '#e8480f',
          700: '#bd3808',
        },
        // ── Status semantics ─────────────────────────────────────────────────
        ok: '#34d399',
        warn: '#fbbf24',
        major: '#fb923c',
        crit: '#f87171',
        // status aliases used by severity maps
        'status-healthy': '#34d399',
        'status-degraded': '#fbbf24',
        'status-major': '#fb923c',
        'status-critical': '#f87171',
        // ── Text ramp ────────────────────────────────────────────────────────
        txt: {
          hi: '#eceef0',
          mid: '#9aa2ab',
          lo: '#5c646d',
          dim: '#353c44',
        },
        'theme-orange': '#fa5c29',
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
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.9)',
        'panel-hover': '0 1px 0 rgba(255,255,255,0.06) inset, 0 30px 60px -28px rgba(0,0,0,0.95)',
        'glow-accent': '0 0 0 1px rgba(250,92,41,0.35), 0 0 28px -6px rgba(250,92,41,0.55)',
        'glow-ok': '0 0 12px -1px rgba(52,211,153,0.65)',
        'glow-crit': '0 0 12px -1px rgba(248,113,113,0.7)',
        'inner-line': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'accent-sheen': 'linear-gradient(135deg, #ff7a4d 0%, #fa5c29 45%, #e8480f 100%)',
        'panel-sheen': 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0) 40%)',
        'grid-fade': 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(250,92,41,0.10), transparent 70%)',
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
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(2200%)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(250,92,41,0.25), 0 0 16px -6px rgba(250,92,41,0.4)' },
          '50%': { boxShadow: '0 0 0 1px rgba(250,92,41,0.5), 0 0 26px -4px rgba(250,92,41,0.7)' },
        },
        'spin-slow': {
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.6s ease both',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.22,1,0.36,1) both',
        breathe: 'breathe 2.4s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.22,1,0.36,1) infinite',
        shimmer: 'shimmer 1.6s infinite',
        scan: 'scan 6s linear infinite',
        marquee: 'marquee 32s linear infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
      },
    },
  },
  plugins: [],
}
