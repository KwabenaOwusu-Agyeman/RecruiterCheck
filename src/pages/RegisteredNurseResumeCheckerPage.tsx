import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function RegisteredNurseResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="Registered Nurse Resume Checker | MyRecruiterCheck"
      description="See what recruiters actually check on a registered nurse resume before you apply. Free recruiter-style feedback against the job description."
      path="/registered-nurse-resume-checker"
      eyebrow="Registered Nurse"
      heading="What recruiters actually check on a registered nurse resume"
      introduction="Healthcare recruiters screen for licensure, specialty match, and patient-load experience first. See what gets a nursing resume past the first scan."
      benefits={[
        { title: 'License visibility', description: 'Make sure your RN license and certifications are easy to find, not buried in a skills list.' },
        { title: 'Unit and ratio match', description: 'Check whether your unit type and patient-ratio experience are stated clearly enough for a recruiter to place you.' },
        { title: 'EMR system match', description: 'See whether your charting system experience lines up with what the posting names.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the nursing role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      verdict={{
        jobTitle: 'Registered Nurse',
        reject: [
          'License or certs not visible immediately',
          'No unit or patient-ratio specifics',
          'No EMR system named',
        ],
        accept: [
          'Certs listed at the top',
          'Unit type and ratios stated clearly',
          'EMR system matched to the posting',
        ],
      }}
      faqs={[
        { question: 'Is the registered nurse resume checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your resume matches a specific nursing role before deciding whether you need more checks.' },
        { question: 'Does it check my resume against a specific job description?', answer: 'Yes. Feedback is based on your resume and the job description together, so results are specific to the role you are applying for.' },
        { question: 'Will it invent certifications I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your resume — it never fabricates licenses or experience on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
      ]}
    />
  )
}
