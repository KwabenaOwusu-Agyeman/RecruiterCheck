import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function ResumeStrengthsWeaknessesPage() {
  return (
    <SeoLandingPage
      title="Resume Strengths and Weaknesses Checker | MyRecruiterCheck"
      description="Identify the strongest evidence and most important weaknesses in your resume for a specific job before you apply."
      path="/resume-strengths-and-weaknesses"
      eyebrow="Resume Strengths and Weaknesses"
      heading="See what strengthens or weakens your resume"
      introduction="Understand which parts of your application support an interview and which parts need clearer evidence."
      directAnswer="Resume strengths are relevant, credible details that support your fit for a role. Weaknesses are missing requirements, vague claims or important experience that is difficult to find. MyRecruiterCheck reviews both in relation to a specific job description."
      benefits={[
        { title: 'Find your strongest evidence', description: 'Identify experience and achievements that directly support the target role.' },
        { title: 'Spot unclear claims', description: 'Find vague descriptions, missing results and unsupported statements.' },
        { title: 'Prioritise improvements', description: 'Focus first on the weaknesses most likely to affect the application.' },
      ]}
      steps={['Upload your resume.', 'Add the job description.', 'Review your strengths, areas to improve and prospects.']}
      faqs={[
        { question: 'What makes a resume strong?', answer: 'A strong resume is relevant to the role, easy to scan and supported by credible examples of responsibility and results.' },
        { question: 'What are common resume weaknesses?', answer: 'Common weaknesses include generic summaries, unclear responsibilities, missing outcomes and poor alignment with the vacancy.' },
        { question: 'Can the same resume have different strengths for different jobs?', answer: 'Yes. A detail that is highly relevant to one role may matter less for another, which is why the job description is necessary.' },
        { question: 'How many weaknesses should I fix first?', answer: 'Start with the issues most closely connected to essential job requirements and the clarity of your strongest evidence.' },
      ]}
      relatedLinks={[{ label: 'Job Application Feedback', to: '/job-application-feedback' }, { label: 'Free CV Checker', to: '/free-cv-checker' }, { label: 'Interview Score', to: '/interview-probability-score' }]}
    />
  )
}
