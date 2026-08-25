import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function AdministrativeAssistantResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="Administrative Assistant Resume Checker | MyRecruiterCheck"
      description="See what recruiters actually check on an administrative assistant resume before you apply. Free recruiter style feedback against the job description."
      path="/administrative-assistant-resume-checker"
      eyebrow="Administrative Assistant"
      heading="What recruiters actually check on an administrative assistant resume"
      introduction="This role gets high application volume, so recruiters scan fast for reliability signals and tool proficiency. See what separates a fast yes from the reject pile."
      benefits={[
        { title: 'Tool match', description: 'Check whether the software you list matches what the job posting names.' },
        { title: 'Scope check', description: 'See whether your duties state real scope — volume, number of execs supported.' },
        { title: 'Gap review', description: 'Spot unexplained employment gaps before a recruiter does.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      verdict={{
        jobTitle: 'Administrative Assistant',
        reject: [
          'No named software',
          'Vague duties with no scope',
          'Unexplained employment gaps',
        ],
        accept: [
          'Tools matched exactly to posting',
          'Scope stated — volume, number supported',
          'Tight, specific summary line',
        ],
      }}
      faqs={[
        { question: 'Is the administrative assistant resume checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your resume matches a specific role before deciding whether you need more checks.' },
        { question: 'Does it check my resume against a specific job description?', answer: 'Yes. Feedback is based on your resume and the job description together, so results are specific to the role you are applying for.' },
        { question: 'Will it invent experience I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your resume — it never fabricates tools or scope on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
