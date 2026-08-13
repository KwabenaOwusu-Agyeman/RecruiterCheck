import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function CoverLetterGeneratorPage() {
  return (
    <SeoLandingPage
      title="AI Cover Letter Generator for Job Applications | MyRecruiterCheck"
      description="Create a tailored cover letter based on your CV and the job description, focused on relevant evidence and employer value."
      path="/cover-letter-generator"
      eyebrow="Cover Letter Generator"
      heading="Create a cover letter tailored to the job"
      introduction="Turn your most relevant experience into a concise reason for the employer to consider your application."
      directAnswer="A strong cover letter explains why you want the role, connects your most relevant evidence to the employer's needs and ends with a clear expression of interest. MyRecruiterCheck uses your CV and the job description to create a tailored application document."
      benefits={[
        { title: 'Built for one role', description: 'Base the letter on the specific vacancy instead of using a generic template.' },
        { title: 'Focused on evidence', description: 'Highlight the experience and value that best support your application.' },
        { title: 'Clear and concise', description: 'Give recruiters a direct reason to continue reviewing your application.' },
      ]}
      steps={['Upload your CV.', 'Add the job description.', 'Review and personalise the tailored cover letter before sending it.']}
      faqs={[
        { question: 'What should a cover letter include?', answer: 'It should state why you are applying, connect relevant experience to the role and close with a clear expression of interest.' },
        { question: 'Should every application have a different cover letter?', answer: 'Yes. A tailored letter should reflect the employer, role and strongest relevant evidence for that application.' },
        { question: 'How long should a cover letter be?', answer: 'Keep it concise enough to scan quickly. Focus on a small number of strong, relevant points rather than repeating your entire CV.' },
        { question: 'Should I review an AI generated letter?', answer: 'Yes. Confirm every claim, adjust the tone and add any personal motivation that is not present in your CV.' },
      ]}
      relatedLinks={[{ label: 'Recruiter Message Generator', to: '/recruiter-message-generator' }, { label: 'Tailor CV to Job', to: '/tailor-cv-to-job-description' }, { label: 'Job Application Feedback', to: '/job-application-feedback' }]}
    />
  )
}
