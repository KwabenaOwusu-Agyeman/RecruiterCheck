import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function ApplicationCheckerPage() {
  return (
    <SeoLandingPage
      title="Job Application Checker | MyRecruiterCheck"
      description="Compare your CV with a job description and get recruiter style feedback, strengths, improvement areas and an Interview Score before you apply."
      path="/application-checker"
      eyebrow="Job Application Checker"
      heading="Check your job application before you apply"
      introduction="Upload your CV and the job description to see how clearly your application demonstrates the experience, skills and value the role requires."
      directAnswer="The Application Checker compares your CV directly with a specific job description and reports back the way a recruiter would read the match: whether your experience is at the right level for the role, whether the skills the employer asked for are backed by real evidence, and whether there's a clear, credible reason to interview you over another candidate. The result is an Interview Score broken down by experience, skills and candidate value, plus Strengths, Areas to Improve and Prospects, all based only on what's already in your CV and the job description. See the full methodology on how the score works."
      benefits={[
        { title: 'Interview Score', description: 'See an evidence based estimate of how strongly your CV matches the role.' },
        { title: 'Recruiter style feedback', description: 'Understand the strengths a recruiter may notice and the gaps that may weaken your application.' },
        { title: 'Clear next steps', description: 'Get practical recommendations you can apply before submitting your application.' },
      ]}
      steps={[
        'Upload your current CV.',
        'Add the job description for the role you want.',
        'Review your score, strengths, improvement areas and prospects.',
      ]}
      faqs={[
        { question: 'How is the Application Checker different from an ATS checker?', answer: 'An ATS checker mostly counts keyword overlap. The Application Checker evaluates whether your experience, skills and candidate value are genuinely demonstrated with evidence, the way a recruiter reads a CV once it passes keyword screening.' },
        { question: 'Do I need an account to use it?', answer: 'You need a free account to run a check, and your first Recruiter Check is free with full feedback.' },
        { question: 'Does it work for early career candidates and career changers?', answer: 'Yes. It evaluates whatever evidence is in your CV, including internships, academic projects and transferable experience, not only paid job titles in the same field.' },
      ]}
      relatedLinks={[
        { label: 'How Interview Score Works', to: '/how-interview-score-works' },
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'How Recruiters Evaluate a CV', to: '/how-recruiters-evaluate-a-cv' },
      ]}
    />
  )
}
