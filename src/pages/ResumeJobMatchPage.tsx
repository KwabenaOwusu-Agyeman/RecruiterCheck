import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function ResumeJobMatchPage() {
  return (
    <SeoLandingPage
      title="Resume Job Description Match | MyRecruiterCheck"
      description="Match your resume or CV against a job description and identify relevant experience, skills and application gaps before you apply."
      path="/resume-job-description-match"
      eyebrow="Resume Job Match"
      heading="Match your CV to the job description"
      introduction="A strong application makes the connection between your experience and the employer’s requirements easy to see. MyRecruiterCheck helps you find that connection before you apply."
      benefits={[
        { title: 'Experience match', description: 'Check whether your most relevant experience is clear and supported by evidence.' },
        { title: 'Skills match', description: 'See which required skills are demonstrated and which need clearer examples.' },
        { title: 'Candidate value', description: 'Understand whether your strongest reason for being interviewed is visible.' },
      ]}
      steps={[
        'Upload the CV you plan to send.',
        'Paste or upload the exact job description.',
        'Use the feedback to make the match clearer without inventing experience.',
      ]}
    />
  )
}
