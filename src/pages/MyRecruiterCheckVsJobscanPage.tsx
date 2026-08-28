import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsJobscanPage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs Jobscan | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and Jobscan: recruiter judgment versus ATS keyword matching, free access, and pricing."
      path="/myrecruitercheck-vs-jobscan"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs Jobscan"
      introduction="Jobscan scores your resume against an ATS keyword match. MyRecruiterCheck scores it the way a recruiter reads it, against the actual job you're applying for."
      benefits={[
        { title: 'Recruiter judgment, not just keywords', description: 'Feedback reflects what a recruiter weighs when screening, not only whether your resume contains the right words.' },
        { title: 'Built for one job at a time', description: 'Every check is run against the specific job description you provide, not a generic score.' },
        { title: 'Lower cost to start', description: 'Your first check is free, and paid plans start well below Jobscan\'s premium pricing.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the role you want.',
        'Get an Interview Score and recruiter style feedback, not just a keyword match rate.',
      ]}
      comparison={{
        competitor: 'Jobscan',
        lastReviewed: '26 August 2026',
        rows: [
          { label: 'Approach', us: 'Recruiter judgment on your specific application', them: 'ATS keyword and skills match rate' },
          { label: 'Free access', us: 'First Recruiter Check free, no card required', them: '5 scans per month on the free plan' },
          { label: 'Paid packs start at', us: '€10 one time for 5 checks, no subscription', them: '$29.98 per month' },
        ],
      }}
      faqs={[
        { question: 'Is MyRecruiterCheck cheaper than Jobscan?', answer: 'MyRecruiterCheck packs start at €10 one time for 5 checks with no subscription, compared to Jobscan\'s lowest recurring paid plan at $29.98 per month.' },
        { question: 'Does MyRecruiterCheck check ATS compatibility too?', answer: 'MyRecruiterCheck focuses on how a recruiter reads your resume against the job description, not only formatting compatibility with applicant tracking software.' },
        { question: 'Which one should I use?', answer: 'If you want to know whether an algorithm will match keywords, Jobscan does that. If you want to know whether a recruiter would actually shortlist you for this specific role, that\'s what MyRecruiterCheck is built for.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
