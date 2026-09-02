// Synthetic role inputs for exercising the Areas to Improve sample wording
// end to end. Every person, employer, product and posting below is invented;
// see README.md in this directory. No real candidate data, ever.
//
// Used by two things:
//   - supabase/functions/analyze-check/logic.test.ts drives a hand written
//     model output for each role through normalizeAnalysis and asserts the
//     stored improvements carry compliant sample wording.
//   - scripts/live-sample-wording.ts sends the CV and job description to the
//     real model with the production prompt and checks the live output.
//
// roleTerms lists job description vocabulary a credible sample for that role
// should draw from. A sample is expected to use at least one of them.

export interface SampleWordingRole {
  id: string
  jobTitle: string
  jobDescription: string
  cv: string
  roleTerms: string[]
}

export const SAMPLE_WORDING_ROLES: SampleWordingRole[] = [
  {
    id: 'frontend-developer',
    jobTitle: 'Frontend Developer',
    jobDescription: [
      'Frontend Developer at Larkspur Digital, Rotterdam. You will ship production',
      'code for our customer facing React and TypeScript web app. Requirements:',
      'experience building responsive React components with TypeScript, connecting',
      'frontend pages to REST APIs, debugging layout and cross browser issues with',
      'Chrome DevTools, and writing unit tests with Jest and React Testing Library.',
      'You must have contributed to open source projects and be able to explain',
      'technical decisions in writing to designers and product managers. Nice to',
      'have: accessibility work against WCAG 2.2, CI pipelines in GitHub Actions.',
    ].join(' '),
    cv: [
      'Tamsin Oakhurst. Junior Frontend Developer, 1 year.',
      'Brindlewood Studio, Junior Frontend Developer (2025 to present): built',
      'responsive React components in TypeScript for the client booking pages.',
      'Connected the booking pages to the REST API and handled loading and error',
      'states. Fixed layout and browser compatibility issues reported by support.',
      'Wrote Jest tests for the date picker component.',
      'Education: Ashcombe College, BSc Computer Science, 2025.',
      'Skills: React, TypeScript, JavaScript, HTML, CSS, Jest, Git.',
    ].join(' '),
    roleTerms: ['React', 'TypeScript', 'REST', 'Jest', 'React Testing Library', 'Chrome DevTools', 'WCAG', 'GitHub Actions', 'open source', 'pull request', 'CSS'],
  },
  {
    id: 'machine-learning-engineer',
    jobTitle: 'Machine Learning Engineer',
    jobDescription: [
      'Machine Learning Engineer at Fennelmoor Labs, Utrecht. You will train,',
      'evaluate and deploy models that rank content for 2 consumer apps.',
      'Requirements: strong Python, hands on work with PyTorch or scikit-learn,',
      'feature engineering on tabular and text data, experiment tracking with',
      'MLflow, and deploying models as containerised services with Docker and',
      'FastAPI. Must have experience evaluating model quality with offline',
      'metrics and A/B tests. Nice to have: Airflow pipelines, AWS SageMaker.',
    ].join(' '),
    cv: [
      'Idris Wellbrook. Machine Learning Engineer, 2 years.',
      'Corvane Systems, Junior ML Engineer (2024 to present): trained gradient',
      'boosting models in Python with scikit-learn to score support tickets by',
      'urgency. Engineered features from ticket text and metadata. Wrote the',
      'evaluation notebook that reports precision and recall for each release.',
      'Education: Ferndown Institute, MSc Data Science, 2024. Thesis on text',
      'classification with transformers in PyTorch.',
      'Skills: Python, scikit-learn, PyTorch, pandas, SQL, Git.',
    ].join(' '),
    roleTerms: ['Python', 'PyTorch', 'scikit-learn', 'MLflow', 'Docker', 'FastAPI', 'A/B', 'Airflow', 'SageMaker', 'feature', 'precision', 'recall', 'AUC', 'model'],
  },
  {
    id: 'data-analyst',
    jobTitle: 'Data Analyst',
    jobDescription: [
      'Data Analyst at Quillon Retail Group, Eindhoven. You will turn sales and',
      'stock data into decisions for 3 category teams. Requirements: advanced',
      'SQL on a Snowflake warehouse, building and maintaining Power BI dashboards,',
      'Python with pandas for data cleaning, presenting findings to non technical',
      'stakeholders, and documenting metric definitions. Must have experience',
      'with dbt models and data quality checks. Nice to have: Excel modelling,',
      'Google Analytics 4.',
    ].join(' '),
    cv: [
      'Marlow Pennyfeather. Data Analyst, 1 year.',
      'Halden Logistics, Data Analyst (2025 to present): wrote SQL queries',
      'against the Snowflake warehouse to report weekly delivery performance.',
      'Built a Power BI dashboard for the operations team. Cleaned shipment',
      'data with pandas before loading it into the warehouse.',
      'Education: Ashcombe College, BSc Business Analytics, 2025.',
      'Skills: SQL, Snowflake, Power BI, Python, pandas, Excel.',
    ].join(' '),
    roleTerms: ['SQL', 'Snowflake', 'Power BI', 'pandas', 'dbt', 'stakeholder', 'metric', 'dashboard', 'data quality', 'Excel', 'Google Analytics'],
  },
]
