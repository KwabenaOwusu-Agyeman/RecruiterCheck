import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function RecruiterMessageGeneratorPage() {
  return (
    <SeoLandingPage
      title="Recruiter Message Generator for Job Applications | MyRecruiterCheck"
      description="Create a short recruiter message for email, LinkedIn or WhatsApp using your CV and the job description."
      path="/recruiter-message-generator"
      eyebrow="Recruiter Message Generator"
      heading="Write a clear message to the recruiter"
      introduction="Introduce your application with a concise message that gives the recruiter a relevant reason to respond."
      directAnswer="A recruiter message should provide context, state your strongest relevant advantage and end with a simple call to action. MyRecruiterCheck creates a concise message from your CV and the job description for email, LinkedIn or WhatsApp."
      benefits={[
        { title: 'Give clear context', description: 'State the role and explain why you are contacting the recruiter.' },
        { title: 'Lead with your value', description: 'Highlight one relevant strength supported by your experience.' },
        { title: 'Make replying easy', description: 'End with a simple and respectful next step.' },
      ]}
      steps={['Upload your CV.', 'Add the job description.', 'Review and personalise the generated recruiter message before sending it.']}
      faqs={[
        { question: 'What should I say to a recruiter?', answer: 'Mention the role, state one relevant reason you may be a good fit and ask a simple question or express interest in speaking.' },
        { question: 'How long should the message be?', answer: 'Keep it short enough to understand in seconds. One concise paragraph is usually sufficient.' },
        { question: 'Can I use the message on LinkedIn?', answer: 'Yes. Review the wording and shorten it further if the platform limits the number of characters.' },
        { question: 'Should I send the same message to every recruiter?', answer: 'No. Personalise the role, company and strongest relevant point for each person you contact.' },
      ]}
      relatedLinks={[{ label: 'Cover Letter Generator', to: '/cover-letter-generator' }, { label: 'Application Checker', to: '/application-checker' }, { label: 'Free CV Checker', to: '/free-cv-checker' }]}
    />
  )
}
