import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function SalesResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="Sales Resume Checker | MyRecruiterCheck"
      description="See what recruiters actually check on a sales resume before you apply. Free recruiter-style feedback against the job description."
      path="/sales-resume-checker"
      eyebrow="Sales"
      heading="What recruiters actually check on a sales resume"
      introduction="Sales recruiters go straight to the numbers. If your resume doesn't lead with performance, it's competing against ones that do."
      benefits={[
        { title: 'Quota visibility', description: 'Check whether your quota attainment percentage is easy to find.' },
        { title: 'Revenue proof', description: 'See whether deal size, pipeline value, or revenue figures back up your results.' },
        { title: 'Tool and segment match', description: 'Check whether your CRM and territory or segment line up with the posting.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the sales role you want.',
        'Review your Interview Probability and fix what recruiters would flag before you apply.',
      ]}
      verdict={{
        jobTitle: 'Sales',
        reject: [
          'No quota attainment percentage',
          'No deal size or revenue figures',
          'Activities listed instead of results',
        ],
        accept: [
          'Quota percentage up top',
          'Revenue and deal size on every bullet',
          'CRM and segment specified',
        ],
      }}
      faqs={[
        { question: 'Is the sales resume checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your resume matches a specific sales role before deciding whether you need more checks.' },
        { question: 'Does it check my resume against a specific job description?', answer: 'Yes. Feedback is based on your resume and the job description together, so results are specific to the role you are applying for.' },
        { question: 'Will it invent numbers I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your resume — it never fabricates revenue or quota figures on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Probability', to: '/interview-probability-score' },
      ]}
    />
  )
}
