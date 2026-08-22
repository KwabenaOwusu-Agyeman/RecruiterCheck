import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsKickresumePage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs Kickresume | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and Kickresume: free recruiter feedback on a specific job versus a resume builder with ATS checking locked behind Premium."
      path="/myrecruitercheck-vs-kickresume"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs Kickresume"
      introduction="Kickresume locks its ATS checker and AI tools behind Premium. MyRecruiterCheck gives you full recruiter-style feedback on your first check, free."
      benefits={[
        { title: 'Checking is free from the start', description: 'No need to upgrade to get feedback, your first Recruiter Check includes full results.' },
        { title: 'Matched to the job, not a template score', description: 'Feedback is based on your resume and the job description together, not a generic template rating.' },
        { title: 'Lower cost to start', description: 'Paid plans start well below Kickresume Premium\'s monthly rate.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the role you want.',
        'Get an Interview Score and recruiter-style feedback tied to that exact job.',
      ]}
      comparison={{
        competitor: 'Kickresume',
        rows: [
          { label: 'Approach', us: 'Recruiter judgment on your specific application', them: 'Resume and cover letter template builder' },
          { label: 'Free plan limits', us: 'First Recruiter Check free with full feedback', them: 'ATS checker and AI tools locked behind Premium' },
          { label: 'Paid plans start at', us: '€10 per week', them: '$24 per month (or $8 per month billed yearly)' },
        ],
      }}
      faqs={[
        { question: 'Does Kickresume\'s free plan include an ATS check?', answer: 'No, Kickresume\'s ATS Resume Checker and AI tools require a Premium plan. MyRecruiterCheck includes full feedback on your first check for free.' },
        { question: 'Is MyRecruiterCheck cheaper than Kickresume?', answer: 'MyRecruiterCheck\'s paid plans start at €10 per week, compared to Kickresume Premium\'s monthly rate of $24, or $8 per month if billed yearly.' },
        { question: 'Which one should I use?', answer: 'If you need resume templates and a builder, Kickresume does that. If you want free recruiter-style feedback on a specific job before you apply, that\'s what MyRecruiterCheck is built for.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
