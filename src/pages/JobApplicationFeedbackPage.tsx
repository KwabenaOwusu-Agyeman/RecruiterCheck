import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function JobApplicationFeedbackPage() {
  return (
    <SeoLandingPage
      title="Job Application Feedback Before You Apply | MyRecruiterCheck"
      description="Get recruiter-style feedback on your CV and job description, including strengths, areas to improve and prospects."
      path="/job-application-feedback"
      eyebrow="Job Application Feedback"
      heading="Get feedback before you submit your application"
      introduction="See how your application may look to a recruiter and improve the evidence before you apply."
      directAnswer="Useful job application feedback compares your documents with the actual role, identifies relevant strengths, explains important gaps and gives practical next steps. MyRecruiterCheck provides structured feedback based on your CV and the job description."
      benefits={[
        { title: 'Role specific review', description: 'Assess your application against the vacancy rather than generic resume rules.' },
        { title: 'Balanced feedback', description: 'See strengths, areas to improve and realistic prospects in one clear review.' },
        { title: 'Practical next steps', description: 'Know what to clarify, quantify or prioritise before submitting.' },
      ]}
      steps={['Upload your CV.', 'Add the vacancy or job description.', 'Review the feedback and improve your application before submitting it.']}
      faqs={[
        { question: 'What job application feedback will I receive?', answer: 'You receive an Interview Score, strengths, areas to improve and prospects based on your CV and the target role.' },
        { question: 'Is the feedback specific to my job?', answer: 'Yes. Your CV is compared with the job description you provide, so the feedback reflects that particular application.' },
        { question: 'Can feedback improve my interview chances?', answer: 'It can help you present relevant evidence more clearly, but no tool can guarantee an interview or hiring decision.' },
        { question: 'Should I check every application?', answer: 'Checking is most useful when roles have different priorities or when you have tailored your documents for a specific employer.' },
      ]}
      relatedLinks={[{ label: 'Resume Strengths and Weaknesses', to: '/resume-strengths-and-weaknesses' }, { label: 'Application Checker', to: '/application-checker' }, { label: 'Cover Letter Generator', to: '/cover-letter-generator' }]}
    />
  )
}
