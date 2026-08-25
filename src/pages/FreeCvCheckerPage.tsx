import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function FreeCvCheckerPage() {
  return (
    <SeoLandingPage
      title="Free CV Checker for Job Applications | MyRecruiterCheck"
      description="Check your CV against a specific job description. Get an Interview Score, recruiter style feedback and clear improvements before you apply."
      path="/free-cv-checker"
      eyebrow="Free CV Checker"
      heading="Check your CV before a recruiter does"
      introduction="Compare your CV with the job you want and see what may help or weaken your chance of getting an interview."
      directAnswer="A generic CV checker runs the same grammar and formatting rules over every document, regardless of the job you're applying for. That catches typos, but it won't tell you whether your CV actually makes the case for this specific role. MyRecruiterCheck works differently: your first check is free, and it compares your CV directly against the job description you provide. It reads the requirements the way a recruiter would — checking whether your most relevant experience is easy to find, whether the skills the employer asked for are backed by real examples, and whether there's a clear reason to shortlist you over another candidate. The result is an Interview Score plus specific strengths and areas to improve, tied to that exact job, not generic CV advice you'd get from a template."
      benefits={[
        { title: 'Check the right job', description: 'Measure your CV against the requirements of the specific role you want, not a one-size-fits-all checklist.' },
        { title: 'See recruiter feedback', description: 'Identify the evidence that supports your application and the gaps that may hold it back, explained in plain language.' },
        { title: 'Improve before applying', description: 'Use clear, specific recommendations to make your CV more relevant and easier to assess — before you hit submit, not after a rejection.' },
      ]}
      steps={[
        'Upload your CV in PDF or DOCX format.',
        'Paste or upload the job description for the role you want.',
        'Review your Interview Score, strengths and areas to improve, and adjust your CV accordingly.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A candidate with five years of marketing experience applied for a "Marketing Manager" role that required "experience managing budgets" and "line management experience." Their CV described campaigns they had run but never mentioned who they managed or what budget they controlled.',
        insight: 'The experience was almost certainly there — most marketing managers handle both — but it wasn\'t written down, so a recruiter scanning the CV in under a minute would miss it. The free check flagged both as unclear rather than assuming they were missing, which let the candidate add two specific lines (team size, annual budget figure) instead of rewriting the whole CV.',
      }}
      faqs={[
        { question: 'Is the CV checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your CV matches a specific job before deciding whether you need more checks.' },
        { question: 'Does it check my CV against a job description?', answer: 'Yes. The feedback is based on both your CV and the job description, so the result is specific to the application you are preparing, not generic advice.' },
        { question: 'What feedback will I receive?', answer: 'You receive an Interview Score, strengths, genuine areas to improve, and prospects based only on the evidence in your CV and the job description.' },
        { question: 'Does a high score guarantee an interview?', answer: 'No. The result is an evidence-based estimate, not a hiring guarantee. Recruiters may consider other candidates and information outside your documents.' },
        { question: 'Will it invent experience I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your CV. MyRecruiterCheck never fabricates employers, skills, or achievements on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
