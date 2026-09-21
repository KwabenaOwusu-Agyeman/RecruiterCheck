import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function SoftwareEngineerResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="Software Engineer Resume Checker | MyRecruiterCheck"
      description="See what recruiters actually check on a software engineer resume before you apply. Free recruiter style feedback against the job description."
      path="/software-engineer-resume-checker"
      eyebrow="Software Engineer"
      heading="What recruiters actually check on a software engineer resume"
      introduction="Recruiters reading engineering resumes are matching what you have built against one specific posting. See what they check before you apply."
      directAnswer="A recruiter screening a software engineer resume or CV is checking three things against the specific job description: whether your languages and frameworks match the stack the role actually uses, whether your bullets show what you built and shipped rather than listing duties, and whether the resume makes clear how much of the work was yours and how far it reached, such as who used it or how large the system was, where that is true. A resume that lists a matching stack but only describes duties reads as a keyword list, not evidence. MyRecruiterCheck compares your resume against the exact job description you are applying to and reports on whether your experience, skills and candidate value are demonstrated with evidence, not just present as words."
      benefits={[
        { title: 'Stack match', description: 'See whether your listed languages and frameworks line up with what the job description actually asks for.' },
        { title: 'Outcome check', description: 'Find bullets that describe duties instead of what you built and what happened.' },
        { title: 'Scale signal', description: 'Spot where scale, such as users, latency, or team size, is real but not stated.' },
      ]}
      steps={[
        'Upload your resume in PDF or DOCX format.',
        'Paste the job description for the engineering role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'Take an invented resume for a "Junior Software Engineer" role that listed "Java, Spring Boot, PostgreSQL, Git" with one bullet reading "Worked on a team project building a student marketplace." The job description asked for someone who could "write and maintain automated tests for the services you ship."',
        insight: 'The stack matched, but nothing showed the habit the posting emphasized: testing what you build. Rewriting the bullet to say which service the candidate owned, and that they wrote automated tests for it, including one bug the tests caught, gave the recruiter evidence of ownership from work the candidate had already done, without adding anything that was not there.',
      }}
      verdict={{
        jobTitle: 'Software Engineer',
        reject: [
          'No languages or frameworks up top',
          'Duties instead of outcomes',
          'No scale (users, latency, team size)',
        ],
        accept: [
          'Stack matched to the posting',
          'Bullets say what was built and what happened',
          'Ownership language ("built," "shipped")',
        ],
      }}
      faqs={[
        { question: 'Is the software engineer resume checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your resume matches a specific engineering role before deciding whether you need more checks.' },
        { question: 'I only have projects, an internship or a bootcamp, no software engineer job title. Does this still work?', answer: 'Yes. MyRecruiterCheck evaluates the evidence already in your resume, including personal projects, internships, bootcamp work and coursework, not only paid job titles. What matters is whether what you built, which part was yours and what happened are described with specifics.' },
        { question: 'Does it check my resume against a specific job description?', answer: 'Yes. Feedback is based on your resume and the job description together, so results are specific to the role you are applying for.' },
        { question: 'How is a software engineer resume check different from an AI engineer one?', answer: 'The core check is the same: your resume against one specific job description. What differs is what the role asks for. For an AI engineer posting, a recruiter first checks the type of AI work, such as LLM applications, retrieval, agents or fine tuning. For a software engineer posting, the first checks are whether your stack matches the one the role uses and whether your bullets show what you built and shipped. If you are applying to both, run each role against its own job description.' },
        { question: 'Is this the same as an ATS check?', answer: 'No. An ATS check mostly counts keyword matches between your resume and a job description. This is about how a person judges your resume once it reaches them, which looks at evidence such as what you built and what happened, not only whether a language or framework name appears.' },
        { question: 'Will it invent skills or projects I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your resume. It never fabricates technologies or achievements on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
        { label: 'Data Analyst CV Checker', to: '/data-analyst-cv-checker' },
        { label: 'Data Scientist CV Checker', to: '/data-scientist-cv-checker' },
        { label: 'Machine Learning Engineer CV Checker', to: '/machine-learning-engineer-cv-checker' },
        { label: 'AI Engineer CV Checker', to: '/ai-engineer-cv-checker' },
        { label: 'Do Projects Count Without a Job Title?', to: '/resources/do-projects-count-without-a-job-title' },
        { label: 'What a Software Engineer CV Needs in Its First Half Page', to: '/resources/what-a-software-engineer-cv-needs-in-its-first-half-page' },
      ]}
    />
  )
}
