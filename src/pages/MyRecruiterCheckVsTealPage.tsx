import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsTealPage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs Teal | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and Teal: recruiter feedback on a specific job versus a job search organizer and resume builder, plus pricing."
      path="/myrecruitercheck-vs-teal"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs Teal"
      introduction="Teal is a job search organizer and resume builder. MyRecruiterCheck is a check, it tells you whether a recruiter would shortlist you for a specific job before you apply."
      benefits={[
        { title: 'Built to check, not to build', description: 'MyRecruiterCheck focuses on evaluating your resume against a specific job, not managing your job search or building a resume from scratch.' },
        { title: 'Full match feedback on your free check', description: 'Your first Recruiter Check includes complete feedback matched to the job description, not a capped credit allotment.' },
        { title: 'Lower cost to start', description: 'Paid plans start well below Teal+.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the role you want.',
        'Get an Interview Probability and recruiter-style feedback tied to that exact job.',
      ]}
      comparison={{
        competitor: 'Teal',
        rows: [
          { label: 'Approach', us: 'Recruiter judgment on your specific application', them: 'Job search organizer, tracker, and resume builder' },
          { label: 'Free plan limits', us: 'First Recruiter Check free with full feedback', them: 'AI features such as the job match scorer capped at 10 credits' },
          { label: 'Paid plans start at', us: '€9.99 per week', them: '$79 per quarter (billed quarterly)' },
        ],
      }}
      faqs={[
        { question: 'Does Teal check my resume against a specific job?', answer: 'Teal\'s free plan shows the top keywords from a job description, with the full numeric match score and unlimited use reserved for Teal+. MyRecruiterCheck includes full feedback matched to the job on your first free check.' },
        { question: 'Is MyRecruiterCheck cheaper than Teal?', answer: 'Yes. MyRecruiterCheck\'s paid plans start at €9.99 per week, compared to Teal+\'s cheapest recurring option at $79 per quarter.' },
        { question: 'Which one should I use?', answer: 'If you want to organize and track your job search, Teal does that. If you want to know whether a recruiter would shortlist you for one specific job before you apply, that\'s what MyRecruiterCheck is built for.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'Resume Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Probability', to: '/interview-probability-score' },
      ]}
    />
  )
}
