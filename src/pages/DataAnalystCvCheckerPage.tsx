import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function DataAnalystCvCheckerPage() {
  return (
    <SeoLandingPage
      title="Data Analyst CV Checker | MyRecruiterCheck"
      description="See what recruiters check on a data analyst CV before you apply: SQL and tooling evidence, business impact, and whether your analysis actually changed a decision."
      path="/data-analyst-cv-checker"
      eyebrow="Data Analyst"
      heading="What recruiters actually check on a data analyst CV"
      introduction="Data analyst applications are full of the same three tools and the same vague phrase, 'analyzed data to drive insights.' See what separates a CV that gets shortlisted from one that doesn't, before you apply."
      directAnswer="A recruiter screening a data analyst CV is checking three things against the specific job description: whether your tools match what the role actually uses (SQL, a BI tool like Tableau or Power BI, Python or R, spreadsheets at scale), whether you can show a real business question you answered rather than just listing 'data analysis' as a duty, and whether the result of your analysis is stated in terms someone outside the data team would understand, such as a decision it changed or a number it moved. A CV that lists SQL, Excel and Tableau with no example of what was built or decided reads as a keyword list, not evidence. MyRecruiterCheck compares your CV against the specific job description for the role you're applying to and reports on exactly this: whether your experience, tools and value are demonstrated with evidence, not just present as words."
      benefits={[
        { title: 'Tooling match', description: 'See whether the SQL, BI tools and languages the job asks for are shown with a real project, not just listed in a skills section.' },
        { title: 'Business impact, not busywork', description: 'Find bullets that describe running a query or building a dashboard without saying what decision it supported or what changed as a result.' },
        { title: 'Stakeholder signal', description: 'Spot where evidence of presenting findings to non technical stakeholders is missing, since most data analyst postings ask for it directly.' },
      ]}
      steps={[
        'Upload your CV in PDF or DOCX format.',
        'Paste the job description for the data analyst role you want.',
        'Review your Interview Score and fix what recruiters would flag before you apply.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A recent graduate applying for a "Junior Data Analyst" role listed "SQL, Excel, Power BI, data cleaning" under skills, with one bullet reading "Analyzed sales data for a university project." The job description asked for someone who could "turn raw data into recommendations stakeholders can act on."',
        insight: 'The tools matched, but there was no evidence of the one thing the posting emphasized: a recommendation that changed a decision. Rewriting the bullet to name the actual question ("built a dashboard that showed which product categories were losing margin, which the team used to cut two underperforming lines") gave the recruiter a concrete reason to interview, without adding any experience that wasn\'t already there.',
      }}
      verdict={{
        jobTitle: 'Data Analyst',
        reject: [
          'Tools listed with no project behind them',
          '"Analyzed data" with no question or outcome',
          'No mention of presenting findings to anyone',
        ],
        accept: [
          'SQL, BI tool or Python shown in a real project',
          'A specific business question and what was found',
          'A result stated in terms a non analyst would understand',
        ],
      }}
      faqs={[
        { question: 'Is the data analyst CV checker free?', answer: 'Yes. Your first Recruiter Check is free, so you can see how your CV matches a specific data analyst role before deciding whether you need more checks.' },
        { question: 'I only have university projects and no job experience. Can this still help?', answer: 'Yes. MyRecruiterCheck evaluates the evidence in your CV, including course projects, internships and personal projects, not only paid job titles. What matters is whether the tools and outcomes are shown with specifics.' },
        { question: 'Does it check my CV against a specific job description?', answer: 'Yes. Feedback is based on your CV and the job description together, so results are specific to the data analyst role you\'re applying for, not a generic template.' },
        { question: 'Will it invent tools or projects I haven\'t used?', answer: 'No. Feedback is based only on what\'s already in your CV, it never fabricates a tool, dataset or result on your behalf.' },
      ]}
      relatedLinks={[
        { label: 'Data Scientist CV Checker', to: '/data-scientist-cv-checker' },
        { label: 'How the Interview Score works', to: '/how-interview-score-works' },
        { label: 'ATS Resume Checker', to: '/ats-resume-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
      ]}
    />
  )
}
