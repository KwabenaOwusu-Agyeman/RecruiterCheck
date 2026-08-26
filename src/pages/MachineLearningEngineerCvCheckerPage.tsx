import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MachineLearningEngineerCvCheckerPage() {
  return (
    <SeoLandingPage
      title="Machine Learning Engineer CV Checker | MyRecruiterCheck"
      description="See what recruiters check on a machine learning engineer CV before you apply: deployment and systems evidence, not just model training."
      path="/machine-learning-engineer-cv-checker"
      eyebrow="Machine Learning Engineer"
      heading="What recruiters actually check on a machine learning engineer CV"
      introduction="Machine learning engineer is not the same job as data scientist, and recruiters read the CV differently. See what they're scanning for around deployment, scale and reliability before you apply."
      directAnswer="A recruiter screening a machine learning engineer CV is checking whether you can take a model from training to something that runs reliably in production, which is a different bar than being able to train one. They look for evidence of the ML lifecycle beyond notebooks: data pipelines, model serving or deployment (an API, a batch job, an edge device), monitoring for drift or failure, and the engineering practices around it such as version control, testing, or CI/CD applied to ML code. They also check whether the specific frameworks and infrastructure named in the job description, such as PyTorch, TensorFlow, Docker, or a cloud ML platform, are shown in a real system rather than listed as familiarity. A CV that describes training a model with good metrics but never mentions how or whether it was deployed reads as research experience, not engineering experience, for this role. MyRecruiterCheck compares your CV against the specific job description you're applying to and reports on whether your experience, skills and candidate value are demonstrated with real evidence."
      benefits={[
        { title: 'Deployment evidence', description: 'See whether your CV shows a model that reached production, an API, a pipeline, an edge deployment, not just training and evaluation.' },
        { title: 'Engineering practices', description: 'Find where evidence of testing, versioning, or CI/CD for ML code is missing, since this is what separates engineering from research on paper.' },
        { title: 'Framework and infra match', description: 'Check whether the specific tools the posting names are shown in a real system your CV describes, not a bare skills list.' },
      ]}
      steps={[
        'Upload your CV in PDF or DOCX format.',
        'Paste the job description for the ML engineering role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A candidate applying for a "Machine Learning Engineer" role wrote "Trained a computer vision model achieving 94% accuracy for a university capstone project." The job description asked for someone who could "own a model from experimentation through to a served endpoint monitored in production."',
        insight: 'The training work was solid, but the CV said nothing about serving, monitoring, or the engineering side the role actually needed. Adding one line, that the model was wrapped in a Flask API and containerized with Docker for the capstone demo, turned a research bullet into engineering evidence, using work the candidate had already done but hadn\'t described in those terms.',
      }}
      verdict={{
        jobTitle: 'Machine Learning Engineer',
        reject: [
          'A model with metrics but no deployment mentioned',
          'Frameworks listed with no system behind them',
          'No sign of testing, versioning or monitoring',
        ],
        accept: [
          'A model tied to a served endpoint, pipeline or product',
          'Named tools shown in a real, described system',
          'Some evidence of engineering practice, not just training',
        ],
      }}
      faqs={[
        { question: 'Is the machine learning engineer CV checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your CV matches a specific ML engineering role before deciding whether you need more checks.' },
        { question: 'What\'s the difference between this and the data scientist checker?', answer: 'Recruiters read the two roles differently. Data scientist CVs are judged on modeling depth and business outcomes; machine learning engineer CVs are judged more on deployment, systems and engineering practice. Use whichever page matches the job description you\'re applying to.' },
        { question: 'I\'ve only deployed models for personal or academic projects. Does this still work?', answer: 'Yes. MyRecruiterCheck evaluates the evidence already in your CV, including personal projects, coursework and internships, not only paid job titles. What matters is whether the deployment and engineering detail is specific.' },
        { question: 'Will it invent deployment experience I don\'t have?', answer: 'No. Feedback is based only on what\'s already in your CV, it never fabricates a pipeline, deployment or result on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'AI Engineer CV Checker', to: '/ai-engineer-cv-checker' },
        { label: 'Data Scientist CV Checker', to: '/data-scientist-cv-checker' },
        { label: 'How the Interview Score works', to: '/how-interview-score-works' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
      ]}
    />
  )
}
