/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surfaces ─────────────────────────────────────────────────────────
        canvas: '#0A0C10', // page background
        panel: '#12151B', // cards, popovers, nav
        well: '#0D1015', // inputs, sunken areas
        soft: '#171B22', // hover washes, insets
        // ── Borders ──────────────────────────────────────────────────────────
        edge: {
          DEFAULT: '#1F242D',
          strong: '#2B313C',
        },
        // ── Brand accent ─────────────────────────────────────────────────────
        accent: {
          DEFAULT: '#FA5C29',
          hover: '#FF6C3B',
          press: '#E04E1E',
        },
        // ── Status semantics (mirrored by STATUS in src/lib/format.ts) ───────
        ok: '#3FB950',
        warn: '#D29922',
        crit: '#F85149',
        // ── Text ramp ────────────────────────────────────────────────────────
        txt: {
          hi: '#E8EBEF',
          mid: '#98A1AD',
          lo: '#667080',
          faint: '#3F4653',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.3)',
        overlay: '0 16px 48px -12px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.4)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.25s ease both',
        pop: 'pop 0.2s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
