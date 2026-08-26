import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function ResumeJobMatchPage() {
  return (
    <SeoLandingPage
      title="Resume Job Description Match | MyRecruiterCheck"
      description="Match your resume or CV against a job description and identify relevant experience, skills and application gaps before you apply."
      path="/resume-job-description-match"
      eyebrow="Resume Job Match"
      heading="Match your CV to the job description"
      introduction="A strong application makes the connection between your experience and the employer's requirements easy to see. MyRecruiterCheck helps you find that connection before you apply."
      directAnswer="Matching a resume to a job description means checking three things at once: whether your experience is at the right level for the role, whether the specific skills the employer asked for are demonstrated rather than just listed, and whether a recruiter reading your CV for the first time can quickly see why you're a credible candidate. Most people only check the first two — years of experience and a skills list — and miss the third, which is often what actually decides whether you get shortlisted. MyRecruiterCheck reads your CV and the job description together and reports on all three, requirement by requirement, so you can see exactly where the match is strong and where it needs more evidence."
      benefits={[
        { title: 'Experience match', description: 'Check whether your most relevant experience is clear, at the right level, and supported by evidence — not buried under less relevant history.' },
        { title: 'Skills match', description: 'See which required skills are demonstrated with a real example and which are only mentioned in passing and need a clearer one.' },
        { title: 'Candidate value', description: 'Understand whether your strongest reason for being interviewed is visible to someone reading your CV for the first time.' },
      ]}
      steps={[
        'Upload the CV you plan to send.',
        'Paste or upload the exact job description — not a summary of it.',
        'Use the feedback to make the match clearer without inventing experience you don\'t have.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A candidate applied for a "Product Manager" role that listed "experience with A/B testing" and "cross functional collaboration with engineering and design" as core requirements. Their CV mentioned "worked closely with engineering teams" but had no reference to experimentation of any kind.',
        insight: 'The cross functional requirement was there, just thin — one vague phrase instead of a specific project. The A/B testing requirement was missing entirely, and no amount of rewording could fix that if the candidate genuinely hadn\'t done it. The match report separated these two cases clearly: one needed a stronger example, the other needed an honest decision about whether to apply, learn the gap first, or highlight a closely related skill instead.',
      }}
      faqs={[
        { question: 'What is a resume job description match?', answer: 'It\'s a comparison between your CV and a specific job posting that checks whether your experience level, skills and overall value are clearly demonstrated for that exact role.' },
        { question: 'Why does the exact job description matter?', answer: 'Job titles alone are unreliable — two "Marketing Manager" roles can require completely different skills. Matching against the full description catches requirements a title-only comparison would miss.' },
        { question: 'What if I\'m missing a required skill entirely?', answer: 'The check will tell you honestly rather than suggesting you word around it. If a requirement genuinely isn\'t met, the better move is usually a closely related strength, not invented experience.' },
        { question: 'Can I use this for more than one job at a time?', answer: 'Run a separate check for each job description. Requirements differ enough between postings that a single generic match won\'t reflect what a specific recruiter is looking for.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'Interview Score', to: '/interview-probability-score' },
        { label: 'How Interview Score Works', to: '/how-interview-score-works' },
        { label: 'Tailor CV to Job Description', to: '/tailor-cv-to-job-description' },
      ]}
    />
  )
}
