/**
 * Demo content for the landing page's role-based feedback showcase and
 * document previews. EXAMPLE_DOCUMENTS and four of the five ROLE_EXAMPLES
 * entries are fully fictional illustrations of what the real Feedback page
 * and generate-documents function produce — no production data, no database
 * query, no OpenAI call. The 'software-engineer' entry is the exception: its
 * score, strengths, improvements, and prospects are the genuine output of a
 * real check run against this same CV and job description (Alex Morgan,
 * Software Engineer, Lumen Cloud) through the actual scoring pipeline.
 */

export type RoleExampleTier = 'likely' | 'improve' | 'not-a-fit'

export interface RoleExample {
  id: string
  role: string
  experience: string
  companyName: string
  score: number
  tier: RoleExampleTier
  strengths: readonly string[]
  improvements: readonly string[]
  prospects: readonly string[]
}

/**
 * One example per role, deliberately spanning 0-5 years experience and all
 * three score tiers, so the landing page pill selector shows the tool
 * reading each career stage differently rather than reusing one template.
 */
export const ROLE_EXAMPLES: readonly RoleExample[] = [
  {
    id: 'software-engineer',
    role: 'Software Engineer',
    experience: '4 years experience',
    companyName: 'Lumen Cloud',
    score: 85,
    tier: 'likely',
    strengths: [
      'Strong backend ownership. Your experience owning the payments microservice demonstrates your capability to manage critical backend services effectively.',
      'Effective cross team collaboration. Your ability to coordinate across teams during architecture migrations highlights your strong communication skills.',
    ],
    improvements: [
      'Quantify your impact. While you mention improving checkout API performance, providing specific metrics would strengthen your application. Example: Consider adding details like the percentage increase in performance or reduction in response time.',
    ],
    prospects: [
      'Your CV shows strong documented evidence for 3+ years of professional software engineering experience.',
      'Addressing the remaining refinement could further strengthen your interview chances.',
    ],
  },
  {
    id: 'ai-ml-engineer',
    role: 'AI/ML Engineer',
    experience: '2 years experience',
    companyName: 'Vantage AI',
    score: 76,
    tier: 'improve',
    strengths: [
      'Hands on model delivery. Shipped two production ML models at your current role, which is exactly the kind of end-to-end delivery Vantage AI is screening for.',
      'Right tooling background. Your CV lists PyTorch, MLflow and the same cloud stack named in the job description.',
    ],
    improvements: [
      "Show cross functional collaboration. The role asks for close work with product and data engineering, but your CV only describes solo model-building. Example: Partnered with data engineering to productionise the recommendation model behind a 12% lift in click-through rate.",
      "Quantify model impact. You describe what the models do but not what changed because of them. Example: Reduced fraud false-positive rate from 4.1% to 1.6% after retraining on the new feature set.",
    ],
    prospects: [
      'Solid candidate for mid-level ML engineering roles once impact is quantified.',
      'Currently reads closer to a strong junior profile than the mid-level scope this role expects.',
    ],
  },
  {
    id: 'data-scientist',
    role: 'Data Scientist',
    experience: '3 years experience',
    companyName: 'Harbor Analytics',
    score: 71,
    tier: 'improve',
    strengths: [
      'Solid analytical foundation. Three years running A/B tests and building forecasting models lines up with what Harbor Analytics wants for this role.',
      'Clear tooling match. SQL, Python and dbt all appear on your CV and all appear in the job description.',
    ],
    improvements: [
      "Lead with business outcomes, not methods. Your bullet points describe techniques used (regression, clustering) rather than what changed for the business. Example: Built a churn model that flagged at-risk accounts 3 weeks earlier, reducing churn by 9%.",
      "Show stakeholder communication. The job description asks for someone who can present findings to non-technical teams, but nothing on your CV shows that. Example: Presented quarterly retention analysis to the executive team, shaping the Q3 roadmap.",
      'Tighten your summary. It reads as a general data analyst summary rather than one focused on the modeling work this role needs.',
    ],
    prospects: [
      'Reasonable candidate for mid-level data science roles once outcomes are foregrounded.',
      'Needs stronger evidence of stakeholder-facing work to clear this specific bar.',
    ],
  },
  {
    id: 'junior-data-analyst',
    role: 'Junior Data Analyst',
    experience: 'Less than 1 year of experience',
    companyName: 'Marketflow Insights',
    score: 55,
    tier: 'not-a-fit',
    strengths: [
      'Strong academic foundation. Your degree project and two internship placements show real exposure to SQL and dashboarding tools before this application.',
    ],
    improvements: [
      "Show any measurable outcome. Every bullet describes a task (built dashboards, cleaned data) with no result attached. Example: Rebuilt the weekly sales dashboard, cutting reporting time from 3 hours to 20 minutes.",
      "This role asks for 2+ years of stakeholder-facing analytics experience. Your CV shows academic and internship work only, which is a real gap the job post is explicit about, not something phrasing can fix.",
      'Add tool depth. The job description names Looker and dbt specifically; neither appears anywhere on your CV.',
    ],
    prospects: [
      'Better matched to entry-level or associate analyst roles than this specific posting.',
      'The gap here is experience level, not CV quality. Worth applying once you clear 1 to 2 more years, or targeting junior-labeled roles now.',
    ],
  },
  {
    id: 'data-engineer',
    role: 'Data Engineer',
    experience: 'New graduate',
    companyName: 'Pipeline Works',
    score: 48,
    tier: 'not-a-fit',
    strengths: [
      'Relevant coursework and a self built pipeline project show genuine interest and some hands on exposure to the tools this role uses.',
    ],
    improvements: [
      "The job description asks for production experience with Airflow and Spark at scale. Your CV shows one class project using both, which is a real seniority gap for this specific posting.",
      'No professional experience listed. Internships, freelance work, or open-source contributions would all help establish credibility here, even outside a full-time role.',
      "Quantify the project you do have. Example: Built an Airflow pipeline processing 2M records daily for a course project, with 99% uptime over the semester.",
    ],
    prospects: [
      'Better matched to internship or new-grad-labeled data engineering roles than this posting, which is scoped for an experienced hire.',
      'The underlying skills are on the right track; the CV just needs a role at the right level to land an interview.',
    ],
  },
] as const

/**
 * Example Improved CV Draft, Cover Letter, and Recruiter Message, all tied
 * to the Software Engineer / Lumen Cloud profile from ROLE_EXAMPLES so
 * Section 2 continues the same story as Section 1 rather than introducing
 * a new, disconnected candidate.
 */
export const EXAMPLE_DOCUMENTS = {
  candidateName: 'Alex Morgan',
  /**
   * Mirrors the real TailoredCv shape rendered by renderCvPdf/layoutCv in
   * supabase/functions/generate-documents/index.ts (name, contact line,
   * summary, experience, education, section labels), so this preview looks
   * like the actual document a check produces, not an invented format.
   */
  cvDraft: {
    fullName: 'Alex Morgan',
    contactLine: 'Austin, TX • alex.morgan@email.com • 512-555-0148 • linkedin.com/in/alexmorgan',
    sectionLabels: {
      summary: 'Professional Summary',
      experience: 'Work Experience',
      education: 'Education',
    },
    professionalSummary:
      'Software engineer with 4 years building and owning backend systems at scale, from payments infrastructure to service architecture migrations.',
    experience: [
      {
        title: 'Software Engineer',
        companyLocation: 'Beacon Systems · Austin, TX',
        dates: 'Aug 2023 – Present',
        bullets: [
          'Owned the payments microservice end to end, cutting checkout API latency from 800ms to 210ms by introducing request batching and connection pooling.',
          'Led the migration from a monolith to a service-oriented architecture, coordinating across three teams with zero downtime.',
          'Mentored two junior engineers through their first year, both promoted to mid-level within twelve months.',
        ],
      },
      {
        title: 'Software Engineer',
        companyLocation: 'Northline Systems · Austin, TX',
        dates: 'Jun 2022 – Jul 2023',
        bullets: [
          'Built and shipped two internal tools adopted by a 15 person engineering team, cutting manual deployment steps from 6 to 1.',
          'Fixed high priority bugs across the checkout and authentication services, contributing to a 30% drop in weekly incident tickets.',
          "Paired with senior engineers to introduce the team's first automated test suite, reaching 60% coverage on critical paths within six months.",
        ],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'University of Texas at Austin',
        dates: '2018 – 2022',
      },
    ],
  },
  /**
   * Mirrors the real CoverLetter schema (see systemPrompt's "2. cover_letter"
   * spec and layoutCoverLetter in supabase/functions/generate-documents/
   * index.ts): a date + company/location block, salutation, one intro
   * paragraph, exactly 3 body paragraphs (each a distinct piece of evidence
   * or a soft-skills close), a conclusion, and a separate thank-you line —
   * not a flattened list of generic paragraphs.
   */
  coverLetter: {
    companyLocation: 'Austin, TX',
    salutation: 'Dear Lumen Cloud Hiring Team,',
    introParagraph:
      "I'm applying for the Software Engineer role at Lumen Cloud because the scope you're describing, owning services end to end rather than shipping tickets, is exactly the kind of work I've spent the last four years doing.",
    bodyParagraphs: [
      "At Beacon Systems, I owned our payments microservice from design through production, cutting checkout latency from 800ms to 210ms by rethinking how we batched requests and managed connections. That kind of ownership, from architecture decisions through to the numbers that prove they worked, is what I want to bring to Lumen Cloud's platform team.",
      "Beyond that one project, I led the migration off our monolith to a service-oriented architecture, coordinating across three teams and shipping it with zero downtime. It's the kind of cross-team technical leadership that only comes from being trusted with systems bigger than any one engineer's usual scope, and it's exactly the level I'm looking to keep operating at.",
      "Alongside the technical work, I've mentored two junior engineers through their first year on the team, both promoted to mid-level within twelve months. I work well independently on ambiguous problems, but I care just as much about the engineers around me getting better, and that balance is something I'd bring to any team I join.",
    ],
    conclusionParagraph:
      "I'd welcome the chance to talk through where I could contribute first, and I'm confident the impact I've had at Beacon Systems is a strong signal for what I'd bring to Lumen Cloud.",
    thankYouLine: 'Thank you for considering my application.',
    closingPhrase: 'Yours sincerely,',
  },
  recruiterMessage: {
    body: [
      "Hi, I saw the Software Engineer opening at Lumen Cloud and wanted to reach out directly.",
      "For the last four years I've owned backend services end to end, most recently a payments microservice where I cut checkout latency from 800ms to 210ms, and I led our migration to a service-oriented architecture with zero downtime.",
      "I think there's a strong fit with what you're building on the platform team, and I'd welcome a short call to discuss.",
    ],
    signOff: 'Best,\nAlex Morgan',
  },
} as const
