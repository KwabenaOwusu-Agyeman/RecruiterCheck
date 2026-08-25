import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { BRAND } from '@/lib/constants'

const TAGLINE = `${BRAND.tagline} Built for AI/ML, data and tech roles.`
const TAGLINE_WORDS = TAGLINE.split(' ')

// A quiet, one-time word-by-word focus pull — each word arrives slightly
// blurred and low, then sharpens into place. No color cycling, no glow,
// no loop: the restraint (and the expo-out easing Linear/Vercel use for
// this exact effect) is what reads as premium rather than decorative.
const taglineContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

const taglineWord = {
  hidden: { opacity: 0, y: 10, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
}

function HeroTagline() {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <p className="mb-4 text-xl font-bold text-navy sm:text-2xl">{TAGLINE}</p>
  }

  return (
    <motion.p
      className="mb-4 text-xl font-bold text-navy sm:text-2xl"
      variants={taglineContainer}
      initial="hidden"
      animate="visible"
      aria-label={TAGLINE}
    >
      {TAGLINE_WORDS.flatMap((word, index) => [
        <motion.span key={`word-${index}`} variants={taglineWord} className="inline-block" aria-hidden="true">
          {word}
        </motion.span>,
        index < TAGLINE_WORDS.length - 1 ? ' ' : null,
      ])}
    </motion.p>
  )
}

export function HeroSection() {
  const handleCheckCta = useCheckCta()

  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      {/* Faint dot-grid backdrop, the same "quiet technical texture" pattern
          Linear/Vercel use on light hero sections — radial-masked so it
          reads as depth near the edges rather than noise behind the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(2,12,56,0.12)_1px,transparent_1px)] bg-[length:28px_28px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_0%,transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-120px] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-blue/10 blur-[100px]"
      />
      <Container className="relative py-[40px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-2xl text-center lg:max-w-[800px]">
          <HeroTagline />
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl lg:text-[54px] lg:leading-[1.1]">
            If you were the <span className="text-blue">recruiter</span>, would you invite yourself
            to an <span className="text-blue">interview</span>?
          </h1>
          <p className="mx-auto mt-[16px] max-w-none text-lg leading-relaxed text-text-secondary sm:mt-5 lg:max-w-[680px] lg:text-xl">
            See what recruiters see. Improve your application before you apply.
          </p>
          <div className="mt-[20px] flex flex-col items-center justify-center gap-3 sm:mt-6">
            <Button size="md" className="sm:!h-12 sm:px-6 sm:text-base" onClick={handleCheckCta}>
              Check My Application
            </Button>
            <p className="text-xs font-medium text-text-secondary">First check free. No card required.</p>
          </div>
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-text-secondary">
            <Link to="/privacy" className="font-semibold text-blue hover:underline">
              CV deleted in 24h
            </Link>
            <span aria-hidden="true">&middot;</span>
            <span>7 day refund</span>
            <span aria-hidden="true">&middot;</span>
            <Link to="/myrecruitercheck-vs-chatgpt" className="font-semibold text-blue hover:underline">
              Why not ChatGPT?
            </Link>
          </p>
        </div>
      </Container>
    </section>
  )
}
