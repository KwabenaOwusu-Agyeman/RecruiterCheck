/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Colour tokens are copied verbatim from the public app's
      // tailwind.config.js so the two surfaces stay one brand. The documented
      // contrast ratios carry over with them: use success-deep / warning-deep
      // for text on light grounds, and the base tokens for fills and bars.
      colors: {
        navy: '#020C38',
        blue: '#194A9F',
        surface: '#FFFFFF',
        background: '#F8F6F2',
        border: '#EFEBE3',
        'border-strong': '#DED6C7',
        'border-soft': '#E9E4D9',
        'navy-tint': '#F1F3FA',
        'text-primary': '#12172A',
        'text-secondary': '#4A5573',
        'text-caption': '#616A80',
        success: '#0EA063',
        warning: '#F59E0B',
        error: '#91151A',
        'success-deep': '#0B7A4B',
        'warning-deep': '#9A5B00',
        'blue-light': '#8FB2F0',
        'error-light': '#FF8A8A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 48px rgba(2,12,56,0.11)',
        elevated: '0 4px 64px rgba(2,12,56,0.17)',
      },
      // The public app overrides the 1-10 spacing keys to a 0.5rem step for
      // marketing layout. That scale is too coarse for dense admin tables, so
      // this app keeps Tailwind's default spacing and takes only the brand
      // colours, type and elevation.
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '42px' }],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out both',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
}

export default config
