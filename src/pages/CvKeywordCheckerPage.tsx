import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function CvKeywordCheckerPage() {
  return (
    <SeoLandingPage
      title="CV Keyword Checker for Job Descriptions | MyRecruiterCheck"
      description="Compare your CV with a job description and identify relevant skills, responsibilities and qualifications that need clearer evidence."
      path="/cv-keyword-checker"
      eyebrow="CV Keyword Checker"
      heading="Find the job requirements your CV may be missing"
      introduction="Check whether your CV clearly reflects the important skills and responsibilities in the vacancy."
      directAnswer="A CV keyword checker compares the language in your CV with a job description. The goal is not to copy every term. It is to identify important skills, responsibilities and qualifications that you genuinely have but have not shown clearly."
      benefits={[
        { title: 'Identify important terms', description: 'See which role specific skills and requirements deserve attention in your CV.' },
        { title: 'Support keywords with proof', description: 'Connect important terms to genuine examples from your work and education.' },
        { title: 'Avoid keyword stuffing', description: 'Keep your writing natural, credible and useful to the recruiter reading it.' },
      ]}
      steps={['Upload your CV.', 'Paste the complete job description.', 'Review weak alignment and add truthful evidence where relevant.']}
      faqs={[
        { question: 'What are CV keywords?', answer: 'They are role specific skills, tools, qualifications, job titles and responsibilities that help describe what an employer needs.' },
        { question: 'Should I include every keyword?', answer: 'No. Include only relevant terms that accurately reflect your background and support them with evidence where possible.' },
        { question: 'Where should keywords appear?', answer: 'Relevant terms can appear naturally in your summary, skills and work experience when they accurately describe what you have done.' },
        { question: 'Will keywords alone get me an interview?', answer: 'No. Recruiters also look for credible experience, results and clear evidence that you can perform the role.' },
      ]}
      relatedLinks={[{ label: 'ATS Resume Checker', to: '/ats-resume-checker' }, { label: 'Tailor CV to Job', to: '/tailor-cv-to-job-description' }, { label: 'Application Checker', to: '/application-checker' }]}
    />
  )
}
