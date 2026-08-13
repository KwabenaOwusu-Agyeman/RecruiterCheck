import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function TailorCvToJobPage() {
  return (
    <SeoLandingPage
      title="Tailor Your CV to a Job Description | MyRecruiterCheck"
      description="Tailor your CV to a specific job description with recruiter-style feedback, relevant evidence and clear application improvements."
      path="/tailor-cv-to-job-description"
      eyebrow="Tailor CV to Job"
      heading="Tailor your CV to the job you want"
      introduction="Focus your CV on the experience, skills and value that matter most for one specific role."
      directAnswer="To tailor a CV, compare it with the job description, identify the employer's most important requirements and present truthful evidence that shows you can meet them. MyRecruiterCheck identifies relevant strengths, missing evidence and practical improvements for the role."
      benefits={[
        { title: 'Focus on the role', description: 'Prioritise experience and skills that directly support the employer’s requirements.' },
        { title: 'Strengthen your evidence', description: 'Turn general claims into clear examples of responsibility, achievement and value.' },
        { title: 'Keep your CV credible', description: 'Improve relevance without inventing experience or copying unsupported keywords.' },
      ]}
      steps={['Upload your current CV.', 'Add the job description you are targeting.', 'Use the feedback and tailored documents to prepare your application.']}
      faqs={[
        { question: 'Why should I tailor my CV for every job?', answer: 'Recruiters assess your CV against the needs of one role. Tailoring makes the most relevant evidence easier to find and understand.' },
        { question: 'Does tailoring mean rewriting my whole CV?', answer: 'Not always. You may only need to adjust your summary, skills and selected experience points so the strongest relevant evidence appears first.' },
        { question: 'Can I use the same CV for similar jobs?', answer: 'You can keep a strong base CV, but review each vacancy because priorities, tools and responsibilities can differ between employers.' },
        { question: 'Should I add experience I do not have?', answer: 'No. Tailoring should improve the presentation of your real experience, not create unsupported claims.' },
      ]}
      relatedLinks={[{ label: 'CV Job Match', to: '/resume-job-description-match' }, { label: 'CV Keyword Checker', to: '/cv-keyword-checker' }, { label: 'Free CV Checker', to: '/free-cv-checker' }]}
    />
  )
}
