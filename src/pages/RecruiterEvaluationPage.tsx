import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function RecruiterEvaluationPage() {
  return (
    <SeoLandingPage
      title="How a Recruiter Evaluates Your CV | MyRecruiterCheck"
      description="Learn what a recruiter notices first on a CV and how they judge experience, skills and candidate value for a specific role."
      path="/how-recruiters-evaluate-a-cv"
      eyebrow="Recruiter Evaluation"
      heading="How a recruiter evaluates your CV"
      introduction="A recruiter does not read your CV top to bottom like a story. They scan it against one specific job, looking for a fast, credible reason to shortlist you."
      directAnswer="A recruiter typically evaluates a CV against a specific job description in a few seconds first, then in more depth if it clears that bar. They check whether your most recent, most relevant experience matches the level and scope of the role, whether the skills the job requires are backed by real examples rather than just listed, and whether there is a clear, credible reason to interview you over another candidate. Passing an ATS keyword scan is not the same as passing this judgment. A CV can contain every keyword from the posting and still fail to convince a recruiter, because keywords alone do not show evidence. MyRecruiterCheck compares your CV with the exact job description you are applying to and reports on experience, skills and candidate value the way a recruiter would, so you can see where the evidence is missing before you apply."
      benefits={[
        { title: 'What a recruiter notices first', description: 'Your most recent, most relevant role and whether it matches the level and scope of the job, before anything else on the page.' },
        { title: 'How skills are judged', description: 'Not whether a skill is listed, but whether it is shown in context with a specific project, tool or result.' },
        { title: 'What decides candidate value', description: 'Whether the CV gives a clear, credible reason to interview you over another applicant with a similar background.' },
      ]}
      steps={[
        'Upload your CV and the specific job description you are applying to.',
        'Get an Interview Score plus Strengths, Areas to Improve and Prospects, based on how a recruiter would read the match.',
        'Strengthen the weak points before you submit, not after a rejection.',
      ]}
      verdict={{
        jobTitle: 'CV',
        reject: [
          'Relevant experience is present but buried under unrelated history.',
          'Required skills are listed once with no supporting example.',
          'Responsibilities are described with no outcome or result attached.',
        ],
        accept: [
          'The most relevant experience is easy to find and matches the role level.',
          'Required skills are shown in a real project, tool or context.',
          'There is a clear, specific reason to interview this candidate for this job.',
        ],
      }}
      faqs={[
        { question: 'Is this the same as an ATS check?', answer: 'No. An ATS check mostly counts keyword matches. This is about how a person judges your CV once it reaches them, which considers evidence and credibility, not just word matches.' },
        { question: 'Why can a CV pass ATS checks but still be rejected?', answer: 'Because a recruiter looks for proof, not just presence. A CV can contain every required keyword and still be rejected if the experience behind those keywords is vague or hard to find.' },
        { question: 'Does MyRecruiterCheck guarantee an interview?', answer: 'No. It gives an evidence based estimate and specific feedback so you can strengthen your application before you apply. It cannot guarantee an interview or hiring decision.' },
        { question: 'Will it invent experience I do not have?', answer: 'No. Feedback is based only on what is already in your CV and the job description. MyRecruiterCheck never invents employers, skills or achievements.' },
      ]}
      relatedLinks={[
        { label: 'Application Checker', to: '/application-checker' },
        { label: 'How Interview Score Works', to: '/how-interview-score-works' },
        { label: 'Resume Strengths and Weaknesses', to: '/resume-strengths-and-weaknesses' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
      ]}
    />
  )
}
