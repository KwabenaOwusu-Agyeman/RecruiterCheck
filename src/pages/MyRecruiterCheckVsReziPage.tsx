import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsReziPage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs Rezi | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and Rezi: recruiter feedback on a specific job versus an AI resume builder, plus free plan limits and pricing."
      path="/myrecruitercheck-vs-rezi"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs Rezi"
      introduction="Rezi is built to write and format your resume. MyRecruiterCheck is built to check it, against the specific job you're applying for, before you apply."
      benefits={[
        { title: 'A check, not a builder', description: 'MyRecruiterCheck evaluates your existing resume against a real job description rather than generating one for you.' },
        { title: 'No download limits on feedback', description: 'Your first Recruiter Check gives full feedback and an Interview Score, not a capped number of downloads.' },
        { title: 'Lower cost to start', description: 'Paid plans start well below Rezi Pro.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the role you want.',
        'Get an Interview Score and recruiter style feedback tied to that exact job.',
      ]}
      comparison={{
        competitor: 'Rezi',
        lastReviewed: '26 August 2026',
        rows: [
          { label: 'Approach', us: 'Recruiter judgment on your specific application', them: 'AI resume builder and formatter' },
          { label: 'Free plan limits', us: 'First Recruiter Check free with full feedback', them: '1 resume and 3 PDF downloads on the free plan' },
          { label: 'Paid packs start at', us: '€10 one time for 5 checks, no subscription', them: '$29 per month (or $149 lifetime)' },
        ],
      }}
      faqs={[
        { question: 'Does Rezi check my resume against a specific job description?', answer: 'Rezi is primarily a resume builder with AI writing tools. MyRecruiterCheck is built specifically to evaluate an existing resume against a job description.' },
        { question: 'Is MyRecruiterCheck cheaper than Rezi?', answer: 'MyRecruiterCheck packs start at €10 one time for 5 checks with no subscription, compared to Rezi Pro at $29 per month.' },
        { question: 'Which one should I use?', answer: 'If you need help writing a resume from scratch, Rezi does that. If you already have a resume and want to know whether a recruiter would shortlist you for a specific job, that\'s what MyRecruiterCheck is built for.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
