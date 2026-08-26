import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function AiEngineerCvCheckerPage() {
  return (
    <SeoLandingPage
      title="AI Engineer CV Checker | MyRecruiterCheck"
      description="See what recruiters check on an AI engineer CV before you apply: real applications built on LLMs and APIs, not just tool names."
      path="/ai-engineer-cv-checker"
      eyebrow="AI Engineer"
      heading="What recruiters actually check on an AI engineer CV"
      introduction="AI engineer job descriptions move fast, and so does the list of tools candidates put on their CV. Recruiters are checking for something more specific than tool names. See what before you apply."
      directAnswer="AI engineer postings vary more than most roles, some want LLM application development, others want RAG systems, agents, or fine-tuning, so a recruiter first checks whether your experience matches the specific type of AI work in that job description, not just 'AI' in general. From there, they look for evidence you've built something that actually works: an application using an LLM API, a retrieval system, a prompt pipeline, or a fine-tuned model, with some sign you understood its limits, such as evaluation, handling failure cases, or cost and latency tradeoffs. Naming tools like OpenAI's API, LangChain, or a vector database without a project behind them reads as familiarity, not capability. Early career candidates are judged on the same evidence, personal projects and hackathon builds count, provided the CV describes what was built and how it was evaluated, not just that it exists. MyRecruiterCheck compares your CV against the specific job description you're applying to and reports on whether your experience, skills and candidate value are demonstrated with real evidence."
      benefits={[
        { title: 'Application match', description: 'See whether your experience matches the specific type of AI work the job needs, LLM apps, RAG, agents, or fine-tuning, not a generic "AI" claim.' },
        { title: 'Built, not just named', description: 'Find where a tool or API is listed with no working project behind it, and where a build needs a clearer description of what it does.' },
        { title: 'Evaluation and limits', description: 'Spot where evidence of testing, evaluating outputs, or handling failure cases and cost is missing, since this signals real understanding over surface familiarity.' },
      ]}
      steps={[
        'Upload your CV in PDF or DOCX format.',
        'Paste the job description for the AI engineering role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A candidate applying for an "AI Engineer" role listed "Experience with OpenAI API, LangChain, vector databases" with no further detail. The job description asked for someone who had "built and evaluated a RAG pipeline in a real application."',
        insight: 'The tools matched exactly, but there was no project behind them, so the recruiter couldn\'t tell whether this was hands-on experience or a reading list. Replacing it with one sentence describing an actual personal project, a document Q&A tool built with a specific vector store, including how retrieval accuracy was checked, converted the same tool names into evidence a recruiter could act on.',
      }}
      verdict={{
        jobTitle: 'AI Engineer',
        reject: [
          'Tools and APIs listed with no project attached',
          'No description of what was actually built',
          'No mention of evaluation, limits, or failure handling',
        ],
        accept: [
          'A specific build matched to the type of AI work in the posting',
          'Tools shown inside a described, working project',
          'Some evidence of evaluating or testing outputs',
        ],
      }}
      faqs={[
        { question: 'Is the AI engineer CV checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your CV matches a specific AI engineering role before deciding whether you need more checks.' },
        { question: 'I\'ve only built personal or hackathon projects, no AI job title. Does this still work?', answer: 'Yes. MyRecruiterCheck evaluates the evidence already in your CV, including personal projects, hackathons and coursework, not only paid job titles. What matters is whether the build and its evaluation are described with specifics.' },
        { question: 'Does it check my CV against a specific job description?', answer: 'Yes. AI engineer postings differ a lot from each other, so feedback is based on your CV matched to the exact job description you\'re applying for, not a generic AI checklist.' },
        { question: 'Will it invent AI projects or results I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your CV, it never fabricates a project, tool or result on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'Machine Learning Engineer CV Checker', to: '/machine-learning-engineer-cv-checker' },
        { label: 'Data Scientist CV Checker', to: '/data-scientist-cv-checker' },
        { label: 'How the Interview Score works', to: '/how-interview-score-works' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
      ]}
    />
  )
}
