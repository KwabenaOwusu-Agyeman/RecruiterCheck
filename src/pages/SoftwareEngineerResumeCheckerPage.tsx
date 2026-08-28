import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function SoftwareEngineerResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="Software Engineer Resume Checker | MyRecruiterCheck"
      description="See what recruiters actually check on a software engineer resume before you apply. Free recruiter style feedback against the job description."
      path="/software-engineer-resume-checker"
      eyebrow="Software Engineer"
      heading="What recruiters actually check on a software engineer resume"
      introduction="Recruiters filtering engineering resumes decide in seconds. See what they're scanning for before you apply."
      benefits={[
        { title: 'Stack match', description: 'See whether your listed languages and frameworks line up with what the job description actually asks for.' },
        { title: 'Outcome check', description: 'Find bullets that describe duties instead of shipped, measurable results.' },
        { title: 'Scale signal', description: 'Spot where scale, such as users, latency, or team size, is missing and should be added.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the engineering role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      verdict={{
        jobTitle: 'Software Engineer',
        reject: [
          'No languages or frameworks up top',
          'Duties instead of outcomes',
          'No scale (users, latency, team size)',
        ],
        accept: [
          'Stack matched to the posting',
          'Every bullet has a number',
          'Ownership language ("built," "shipped")',
        ],
      }}
      faqs={[
        { question: 'Is the software engineer resume checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your resume matches a specific engineering role before deciding whether you need more checks.' },
        { question: 'Does it check my resume against a specific job description?', answer: 'Yes. Feedback is based on your resume and the job description together, so results are specific to the role you are applying for.' },
        { question: 'Will it invent skills or projects I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your resume. It never fabricates technologies or achievements on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
