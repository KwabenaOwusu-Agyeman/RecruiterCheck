import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function ProjectManagerResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="Project Manager Resume Checker | MyRecruiterCheck"
      description="See what recruiters actually check on a project manager resume before you apply. Free recruiter style feedback against the job description."
      path="/project-manager-resume-checker"
      eyebrow="Project Manager"
      heading="What recruiters actually check on a project manager resume"
      introduction="PM resumes get judged on one thing fast: did this person actually run projects, or attend meetings about them? See what recruiters are scanning for."
      benefits={[
        { title: 'Scope numbers', description: 'Check whether budget, team size, and timeline appear on your project bullets.' },
        { title: 'Methodology match', description: 'See whether your named methodology and tools line up with what the posting asks for.' },
        { title: 'Outcome check', description: 'Find vague outcomes that are missing a number — on-time %, cost savings, scope delivered.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the PM role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      verdict={{
        jobTitle: 'Project Manager',
        reject: [
          'No budget, team, or timeline numbers',
          'No named methodology',
          'Vague outcomes with no metric',
        ],
        accept: [
          'Every bullet states scope',
          'Methodology and tools matched to posting',
          'Outcomes tied to numbers',
        ],
      }}
      faqs={[
        { question: 'Is the project manager resume checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your resume matches a specific PM role before deciding whether you need more checks.' },
        { question: 'Does it check my resume against a specific job description?', answer: 'Yes. Feedback is based on your resume and the job description together, so results are specific to the role you are applying for.' },
        { question: 'Will it invent projects or budgets I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your resume — it never fabricates scope or outcomes on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
