// Shared design tokens for every MyRecruiterCheck transactional email.
//
// Values are pulled directly from the live brand system, not invented for
// email: colors match tailwind.config.js (`theme.extend.colors`), the
// button radius matches src/components/ui/Button.tsx (`rounded-[12px]`),
// and the font stack leads with Inter (the site's `font-sans`) with the
// same system-font fallback chain already used in the existing
// "Your Recruiter Check is ready" email (trustpilot-email.ts) and the
// newsletter welcome email, so all MyRecruiterCheck email keeps one look.
//
// Any future email should import EMAIL_TOKENS from here rather than
// hardcoding hex values, so a brand color change only has to happen once.

export const EMAIL_TOKENS = {
  color: {
    navy: '#020C38', // tailwind `navy` — header background, headings
    blue: '#194A9F', // tailwind `blue` — primary button, links
    blueLight: '#8FB2F0', // tailwind `blue-light`
    white: '#FFFFFF',
    background: '#F8F6F2', // tailwind `background` — outer canvas behind the card
    surface: '#FFFFFF', // tailwind `surface` — card background
    border: '#EFEBE3', // tailwind `border`
    borderStrong: '#DED6C7', // tailwind `border-strong`
    textPrimary: '#05050D', // tailwind `text-primary`
    textSecondary: '#3A4A6B', // tailwind `text-secondary` — body copy, muted text
    success: '#0EA063',
    warning: '#F59E0B',
    error: '#91151A',
    buttonBackground: '#020C38', // navy — one calm, confident primary action per email
    buttonText: '#FFFFFF',
  },
  font: {
    // Inter first (matches the site's font-sans); the rest of the stack is
    // the system-font fallback chain email clients actually render with,
    // since Gmail/Outlook/Apple Mail do not reliably load web fonts.
    stack:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  radius: {
    button: '12px', // matches Button.tsx `rounded-[12px]`
    card: '16px', // slightly tighter than the site's 20px Card so it reads calm at email width
  },
  spacing: {
    xs: '8px',
    sm: '16px',
    md: '24px',
    lg: '32px',
    xl: '40px',
  },
  maxWidth: '600px',
} as const
