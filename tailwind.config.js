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
        // 4.7:1 on the cream page ground (#F8F6F2). The previous #7C859C sat
        // at 3.7:1 on white, below AA for the 12px labels this token is
        // used on ("What you get", footer column heads).
        'text-caption': '#616A80',
        success: '#0EA063',
        warning: '#F59E0B',
        error: '#91151A',
        // Text-safe partners for success/warning on light grounds. The base
        // tokens stay for fills, bars and icons; as running text on white
        // they measure 3.4:1 and 2.2:1, so verdict labels and any other
        // text usage on a light card take these instead (5.4:1 / 5.0:1).
        'success-deep': '#0B7A4B',
        'warning-deep': '#9A5B00',
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
        float: {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(-8px)' },
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
        // Hero floating fragments: a slow drift, alternating so the chips
        // bob rather than fly. Second chip offsets its phase with a literal
        // [animation-delay:*] class. Off under prefers-reduced-motion via
        // index.css.
        'float-slow': 'float 6s ease-in-out infinite alternate',
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
