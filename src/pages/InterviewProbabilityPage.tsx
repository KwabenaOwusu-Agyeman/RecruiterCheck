import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function InterviewProbabilityPage() {
  return (
    <SeoLandingPage
      title="Interview Probability | MyRecruiterCheck"
      description="Estimate how strongly your CV matches a specific job and learn what may improve your chances of getting an interview."
      path="/interview-probability-score"
      eyebrow="Interview Probability"
      heading="See how your application may look to a recruiter"
      introduction="Your Interview Probability combines relevant experience, required skills and candidate value to show how convincingly your CV matches one specific role."
      benefits={[
        { title: 'Experience', description: 'Can the employer quickly see that you can do the work?' },
        { title: 'Skills', description: 'Does your CV demonstrate the skills and tools the job requires?' },
        { title: 'Candidate value', description: 'Is there a clear reason to choose you for an interview?' },
      ]}
      steps={[
        'Provide your CV and the target job description.',
        'Receive an Interview Probability and category feedback.',
        'Improve the application and check it again before applying.',
      ]}
    />
  )
}
