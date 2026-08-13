import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function FreeCvCheckerPage() {
  return (
    <SeoLandingPage
      title="Free CV Checker for Job Applications | MyRecruiterCheck"
      description="Check your CV against a specific job description. Get an Interview Probability, recruiter-style feedback and clear improvements before you apply."
      path="/free-cv-checker"
      eyebrow="Free CV Checker"
      heading="Check your CV before a recruiter does"
      introduction="Compare your CV with the job you want and see what may help or weaken your chance of getting an interview."
      directAnswer="A CV checker reviews how clearly your experience, skills and achievements match a specific role. MyRecruiterCheck compares your CV with the job description and gives you an Interview Probability, strengths, areas to improve and practical next steps."
      benefits={[
        { title: 'Check the right job', description: 'Measure your CV against the requirements of the specific role you want.' },
        { title: 'See recruiter feedback', description: 'Identify the evidence that supports your application and the gaps that may hold it back.' },
        { title: 'Improve before applying', description: 'Use clear recommendations to make your CV more relevant and easier to assess.' },
      ]}
      steps={[
        'Upload your CV in PDF or DOCX format.',
        'Paste or upload the job description.',
        'Review your Interview Probability and recruiter-style feedback.',
      ]}
      faqs={[
        { question: 'Is the CV checker free?', answer: 'You can start with a Recruiter Check and review how your CV matches a specific job before deciding whether you need more checks.' },
        { question: 'Does it check my CV against a job description?', answer: 'Yes. The feedback is based on both your CV and the job description, so the result is specific to the application you are preparing.' },
        { question: 'What feedback will I receive?', answer: 'You receive an Interview Probability, two strengths, three areas to improve and two prospects based on the evidence in your application.' },
        { question: 'Does a high score guarantee an interview?', answer: 'No. The result is an evidence-based estimate, not a hiring guarantee. Recruiters may consider other candidates and information outside your documents.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Probability', to: '/interview-probability-score' },
      ]}
    />
  )
}
