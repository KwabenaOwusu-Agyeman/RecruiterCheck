/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
        'text-caption': '#7C859C',
        success: '#0EA063',
        warning: '#F59E0B',
        error: '#91151A',
        'blue-light': '#8FB2F0',
        'error-light': '#FF8A8A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      // Two shadows, not five. Both are ambient in the sense that matters:
      // a wide blur at low alpha with almost no vertical offset, so a card
      // reads as sitting slightly off the page rather than as a box with a
      // drop shadow under it. The coloured `glow` pair this replaces was the
      // most dated effect in the system.
      boxShadow: {
        card: '0 2px 48px rgba(2,12,56,0.11)',
        elevated: '0 4px 64px rgba(2,12,56,0.17)',
      },
      backgroundImage: {
        'gradient-surface': 'linear-gradient(180deg, #FFFFFF 0%, #F8F6F2 100%)',
      },
      keyframes: {
        'fill-bar': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'row-fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'grow-bar': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fill-bar': 'fill-bar 4.5s linear forwards',
        // Scroll-reveal and tab-crossfade animations (see Reveal.tsx,
        // timeline-animation.tsx, ClosingCtaSection.tsx, DashboardShowcase.tsx).
        // Plain CSS classes/keyframes from the compiled stylesheet, not
        // motion/react inline `style` attributes, so none of this needs
        // 'unsafe-inline' or a style-src hash.
        'fade-in-up': 'fade-in-up 0.5s ease-out both',
        'fade-in': 'fade-in 0.25s ease-out both',
        // MyChecksPage row reveal (see the STAGGER_DELAY_CLASS comment
        // there) — same idea as fade-in-up but matching the shorter
        // 8px/0.3s motion/react values it replaced.
        'row-fade-in-up': 'row-fade-in-up 0.3s ease-out both',
        // VerdictCard's score gauge. 'both' + a scaleX(0) start means the
        // fill sweeps in on mount and on every role-pill switch (the fill is
        // keyed by example id); the reduced-motion override in index.css
        // turns the animation off, leaving the bar at its resting full
        // width.
        'grow-bar': 'grow-bar 0.7s ease-out both',
      },
      spacing: {
        1: '0.5rem',
        2: '1rem',
        3: '1.5rem',
        4: '2rem',
        5: '2.5rem',
        6: '3rem',
        7: '3.5rem',
        8: '4rem',
        9: '4.5rem',
        10: '5rem',
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '26px' }],
        lg: ['18px', { lineHeight: '29px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
        '5xl': ['48px', { lineHeight: '52px' }],
      },
    },
  },
  plugins: [],
}
