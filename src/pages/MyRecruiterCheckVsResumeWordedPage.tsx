import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsResumeWordedPage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs Resume Worded | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and Resume Worded: recruiter judgment on a specific job versus a general resume and LinkedIn score, plus pricing."
      path="/myrecruitercheck-vs-resume-worded"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs Resume Worded"
      introduction="Resume Worded gives your resume a general score. MyRecruiterCheck tells you whether a recruiter would shortlist you for the specific job you're applying to."
      benefits={[
        { title: 'Matched to the job, not a general score', description: 'Feedback is based on your resume and the job description together, not a one-size-fits-all grade.' },
        { title: 'Interview Score included from the start', description: 'See an evidence-based estimate of your chances, not just a score out of 100.' },
        { title: 'Full feedback on your first check', description: 'Your first Recruiter Check is free and includes the same feedback structure as a paid check, not a limited preview.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the role you want.',
        'Get an Interview Score and recruiter style feedback tied to that exact job.',
      ]}
      comparison={{
        competitor: 'Resume Worded',
        lastReviewed: '26 August 2026',
        rows: [
          { label: 'Approach', us: 'Feedback matched to one specific job description', them: 'General resume and LinkedIn score' },
          { label: 'Free plan depth', us: 'Full feedback on your first check', them: 'Basic score with limited feedback' },
          { label: 'Paid packs start at', us: '€10 one-time for 5 checks, no subscription', them: '$19 per month (annual plan)' },
        ],
      }}
      faqs={[
        { question: 'Does Resume Worded check my resume against a specific job?', answer: 'Resume Worded\'s free scan gives a general score. MyRecruiterCheck compares your resume directly against the job description you provide.' },
        { question: 'Is MyRecruiterCheck\'s free check limited like Resume Worded\'s?', answer: 'No. Your first Recruiter Check includes full feedback and an Interview Score, not a limited preview.' },
        { question: 'Which one should I use?', answer: 'If you want a general resume grade, Resume Worded does that. If you want to know your odds for one specific job before you apply, that\'s what MyRecruiterCheck is built for.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
