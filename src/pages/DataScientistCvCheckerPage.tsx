import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function DataScientistCvCheckerPage() {
  return (
    <SeoLandingPage
      title="Data Scientist CV Checker | MyRecruiterCheck"
      description="See what recruiters check on a data scientist CV before you apply: modeling evidence beyond a Jupyter notebook, and whether your work reached production or a decision."
      path="/data-scientist-cv-checker"
      eyebrow="Data Scientist"
      heading="What recruiters actually check on a data scientist CV"
      introduction="Most data scientist CVs list the same models and libraries. Recruiters are scanning for something narrower: proof the work went somewhere beyond a notebook. See what they check before you apply."
      directAnswer="A recruiter screening a data scientist CV checks whether your modeling and statistics experience matches the level and type of problem in the job description (classification, forecasting, experimentation, NLP, and so on), whether the tools and libraries you list are backed by a specific project rather than a bare list, and whether there's evidence your work reached a real outcome, a deployed model, an A/B test that shipped, a report that changed a decision, rather than stopping at a notebook with a good accuracy score. Early career and self-taught candidates without a job title in data science are judged the same way: on the evidence in the CV, including academic research, competitions like Kaggle, and personal projects, provided the methodology and outcome are specific. MyRecruiterCheck compares your CV against the exact job description you're applying to and reports on whether your experience, skills and candidate value are demonstrated with real evidence."
      benefits={[
        { title: 'Modeling depth match', description: 'See whether the type of modeling the job needs (forecasting, classification, NLP, experimentation) is shown with a real problem, not just a library name.' },
        { title: 'Beyond the notebook', description: 'Find projects that stop at a model accuracy score with no mention of deployment, a decision it informed, or a test it ran in production.' },
        { title: 'Statistics and rigor', description: 'Spot where evidence of validation, experiment design, or handling messy real-world data is missing, since most postings assume it.' },
      ]}
      steps={[
        'Upload your CV in PDF or DOCX format.',
        'Paste the job description for the data science role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A candidate applying for an "Associate Data Scientist" role listed "Built a churn prediction model using XGBoost, 89% accuracy" for a Kaggle competition. The job description asked for someone who could "work with stakeholders to turn a model into a decision the business can act on."',
        insight: 'The modeling skill was clear, but there was no evidence of the part the posting actually cared about: connecting a model to a decision. Adding one line on how the model\'s output would change what a retention team does, even from a personal project framed that way, gave the recruiter the missing half of the picture without inventing a job that didn\'t exist.',
      }}
      verdict={{
        jobTitle: 'Data Scientist',
        reject: [
          'A library list with no problem attached',
          'A model that stops at an accuracy score',
          'No evidence of validation or real-world data',
        ],
        accept: [
          'A specific problem matched to the role\'s domain',
          'A model tied to a decision, deployment or test',
          'Evidence of how results were validated',
        ],
      }}
      faqs={[
        { question: 'Is the data scientist CV checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your CV matches a specific data science role before deciding whether you need more checks.' },
        { question: 'I only have academic or Kaggle projects, no job title in data science. Does this still work?', answer: 'Yes. MyRecruiterCheck evaluates the evidence already in your CV, including research, coursework, competitions and personal projects, not only paid job titles. What matters is whether the method and outcome are specific.' },
        { question: 'Does it check my CV against a specific job description?', answer: 'Yes. Feedback is based on your CV and the job description together, so results are specific to the data science role you\'re applying for.' },
        { question: 'Will it invent models or results I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your CV, it never fabricates a model, dataset or outcome on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'Machine Learning Engineer CV Checker', to: '/machine-learning-engineer-cv-checker' },
        { label: 'Data Analyst CV Checker', to: '/data-analyst-cv-checker' },
        { label: 'How the Interview Score works', to: '/how-interview-score-works' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
      ]}
    />
  )
}
