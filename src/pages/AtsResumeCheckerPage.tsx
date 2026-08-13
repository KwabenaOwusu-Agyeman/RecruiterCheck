import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function AtsResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="ATS Resume Checker and Job Match | MyRecruiterCheck"
      description="Check whether your resume clearly matches the job title, skills, experience and responsibilities in a job description before you apply."
      path="/ats-resume-checker"
      eyebrow="ATS Resume Checker"
      heading="Check whether your resume matches the job"
      introduction="Find missing job requirements, unclear evidence and weak alignment before your application reaches a recruiter."
      directAnswer="An ATS resume checker looks for alignment between your resume and the job description, including the target role, relevant skills, experience and responsibilities. MyRecruiterCheck goes further by explaining how that evidence may look from a recruiter's perspective."
      benefits={[
        { title: 'Review job alignment', description: 'See whether your resume reflects the role, skills and responsibilities in the vacancy.' },
        { title: 'Find missing evidence', description: 'Identify requirements that are absent, unclear or unsupported in your application.' },
        { title: 'Write for recruiters too', description: 'Improve relevance without turning your resume into a list of copied keywords.' },
      ]}
      steps={[
        'Upload the resume you plan to submit.',
        'Add the complete job description.',
        'Review the match evidence and improve weak areas before applying.',
      ]}
      faqs={[
        { question: 'What does an ATS resume checker look for?', answer: 'It checks whether your resume reflects important information in the vacancy, such as the job title, skills, qualifications, experience and responsibilities.' },
        { question: 'Is an ATS score the same as an interview chance?', answer: 'No. ATS alignment helps your application remain relevant, but recruiters also assess the quality, credibility and value of your experience. MyRecruiterCheck considers both alignment and recruiter-facing evidence.' },
        { question: 'Should I copy every keyword from the job description?', answer: 'No. Include only skills and experience you genuinely have. Support important requirements with clear evidence and results wherever possible.' },
        { question: 'Can this guarantee that my resume passes an ATS?', answer: 'No tool can guarantee that outcome because employers configure their systems differently. The check helps you improve relevant alignment before submitting.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Application Checker', to: '/application-checker' },
      ]}
    />
  )
}
