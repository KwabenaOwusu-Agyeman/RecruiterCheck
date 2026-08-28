import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function InterviewProbabilityPage() {
  return (
    <SeoLandingPage
      title="Interview Score | MyRecruiterCheck"
      description="Estimate how strongly your CV matches a specific job and learn what may improve your chances of getting an interview."
      path="/interview-probability-score"
      eyebrow="Interview Score"
      heading="See how your application may look to a recruiter"
      introduction="Your Interview Score combines relevant experience, required skills and candidate value to show how convincingly your CV matches one specific role."
      directAnswer="Interview Score is an evidence-based estimate of how strongly your CV matches a specific job description, built from three factors: whether your experience is at the right level for the role, whether the skills the employer asked for are demonstrated with real evidence rather than just listed, and whether there's a clear, credible reason to interview you over another applicant. It is not a guarantee of an interview. No tool can promise that, because hiring decisions depend on factors outside any single CV, including the other candidates who applied. What it does give you is a specific, defensible estimate based only on what's actually in your CV and the job description, along with the reasoning behind it, so you can see exactly which factor is holding the score down and fix it before you apply."
      benefits={[
        { title: 'Experience', description: 'Can the employer quickly see that you can do the work, at the level and scope this role requires?' },
        { title: 'Skills', description: 'Does your CV demonstrate the specific skills and tools the job requires, with evidence rather than a bare list?' },
        { title: 'Candidate value', description: 'Is there a clear, specific reason to choose you for an interview rather than another qualified applicant?' },
      ]}
      steps={[
        'Provide your CV and the target job description.',
        'Receive an Interview Score broken down by experience, skills and candidate value.',
        'Improve the weakest factor and check again before applying.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'Two candidates applied for the same "Operations Coordinator" role. Both had comparable years of experience and listed the same required software tools. One CV described specific outcomes, "reduced order-processing time by 30% by redesigning the intake workflow." The other listed responsibilities only, "responsible for order processing."',
        insight: 'Their experience and skills factors were nearly identical. The difference was candidate value: one CV gave the recruiter a concrete, credible reason to interview that person over other applicants with the same background, and the other didn\'t. Interview Score reflected that gap directly, which is the factor most CVs are weakest on and easiest to fix without adding new experience.',
      }}
      faqs={[
        { question: 'What is Interview Score?', answer: 'It\'s an estimate of how strongly your CV matches a specific job, based on your relevant experience, required skills and overall candidate value as demonstrated in your CV.' },
        { question: 'Does a high Interview Score guarantee an interview?', answer: 'No. It\'s an evidence-based estimate, not a hiring guarantee. Recruiters weigh other candidates and factors outside your CV and the job description.' },
        { question: 'Why did my score change after I edited my CV?', answer: 'Interview Score is recalculated from what\'s actually written in your CV. Adding specific, credible evidence for a weak factor, usually candidate value, typically has the biggest effect.' },
        { question: 'Is this the same as an ATS score?', answer: 'No. An ATS score usually measures keyword overlap. Interview Score evaluates whether your experience, skills and value are genuinely demonstrated, the way a recruiter would read your CV.' },
      ]}
      relatedLinks={[
        { label: 'How Interview Score Works', to: '/how-interview-score-works' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
      ]}
    />
  )
}
