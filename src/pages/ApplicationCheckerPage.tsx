import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function ApplicationCheckerPage() {
  return (
    <SeoLandingPage
      title="Job Application Checker | MyRecruiterCheck"
      description="Compare your CV with a job description and get recruiter style feedback, strengths, improvement areas and an Interview Probability before you apply."
      path="/application-checker"
      eyebrow="Job Application Checker"
      heading="Check your job application before you apply"
      introduction="Upload your CV and the job description to see how clearly your application demonstrates the experience, skills and value the role requires."
      benefits={[
        { title: 'Interview Probability', description: 'See an evidence based estimate of how strongly your CV matches the role.' },
        { title: 'Recruiter style feedback', description: 'Understand the strengths a recruiter may notice and the gaps that may weaken your application.' },
        { title: 'Clear next steps', description: 'Get practical recommendations you can apply before submitting your application.' },
      ]}
      steps={[
        'Upload your current CV.',
        'Add the job description for the role you want.',
        'Review your score, strengths, improvement areas and prospects.',
      ]}
    />
  )
}
