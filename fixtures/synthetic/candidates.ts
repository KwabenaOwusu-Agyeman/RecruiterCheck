// Synthetic candidate corpus. Every person, employer and posting below is
// invented; see README.md in this directory. No real candidate data, ever.
//
// Each case carries the classification a recruiter or the model would
// plausibly produce for that CV/JD pair, plus the score expected from the
// documented weights in supabase/functions/analyze-check/logic.ts:
//
//   category 1  Relevant evidence and applied ability   40%
//   category 2  Technical and role specific capability  35%
//   category 3  Role fit and recruiter communication    25%
//
// expectedScore is hand-derived from those weights, not recorded from a run.

import type {
  EvidenceLevel,
  RawRequirement,
} from '../../supabase/functions/analyze-check/logic.ts'

export interface SyntheticCase {
  id: string
  discipline: 'ai' | 'machine-learning' | 'data' | 'software'
  profile: string
  jobTitle: string
  jobDescription: string
  cv: string
  requirements: RawRequirement[]
  evidenceAbility: { appliedEvidence: EvidenceLevel; appliedSkill: EvidenceLevel; results: EvidenceLevel }
  capability: { skillApplication: EvidenceLevel; tools: EvidenceLevel; certifications: EvidenceLevel }
  fitCommunication: {
    roleFit: EvidenceLevel
    valueProposition: EvidenceLevel
    technicalCommunication: EvidenceLevel
    cvStructure: EvidenceLevel
  }
  expectedScore: number
  expectedLabel: string
  note: string
}

const req = (
  text: string,
  category: 'experience' | 'skills',
  importance: 'must_have' | 'important' | 'nice_to_have',
  match_strength: 'strong' | 'partial' | 'none',
  critical = false,
): RawRequirement => ({ requirement: text, category, importance, match_strength, critical } as RawRequirement)

export const SYNTHETIC_CASES: SyntheticCase[] = [
  // -------------------------------------------------------------------------
  {
    id: 'ai-strong-match',
    discipline: 'ai',
    profile: 'strong match',
    jobTitle: 'AI Engineer',
    jobDescription: [
      'AI Engineer at Halberd Analytics. You will build and ship LLM backed',
      'features: retrieval pipelines, evaluation harnesses, and the serving',
      'layer behind them. Essential: strong Python, hands on work with a deep',
      'learning framework, and experience evaluating model output quality.',
      'Desirable: MLOps tooling, containerised deployment.',
    ].join(' '),
    cv: [
      'Rowan Ashgrove. AI Engineer, two years.',
      'Meridian Loom Ltd, AI Engineer (2 years): built a retrieval augmented',
      'answering service over an internal document store in Python and PyTorch.',
      'Designed the offline evaluation harness that scored answer groundedness',
      'and cut unsupported answers from 18 percent to 4 percent over two',
      'quarters. Shipped the serving layer on containerised infrastructure.',
      'Earlier: Ferndown Institute, MSc Computer Science, thesis on retrieval',
      'quality metrics. Tools: Python, PyTorch, Docker, vector stores.',
    ].join(' '),
    requirements: [
      req('Strong Python', 'skills', 'must_have', 'strong'),
      req('Deep learning framework experience', 'skills', 'must_have', 'strong'),
      req('MLOps tooling', 'skills', 'important', 'partial'),
      req('Containerised deployment', 'skills', 'nice_to_have', 'strong'),
      req('Two years building AI backed features', 'experience', 'must_have', 'strong'),
    ],
    evidenceAbility: { appliedEvidence: 'strong', appliedSkill: 'strong', results: 'strong' },
    capability: { skillApplication: 'strong', tools: 'strong', certifications: 'partial' },
    fitCommunication: {
      roleFit: 'strong', valueProposition: 'strong', technicalCommunication: 'strong', cvStructure: 'strong',
    },
    // cat1 = (20*100 + 10*100 + 10*100)/40 = 100
    // skills matrix = (3 + 3 + 1 + 1) / (3 + 3 + 2 + 1) = 8/9 -> 89
    // cat2 = (15*89 + 10*100 + 5*100 + 5*50)/35 = 3085/35 -> 88
    // cat3 = (10*100 + 5*100 + 5*100 + 5*100)/25 = 100
    // 0.4*100 + 0.35*88 + 0.25*100 = 95.8 -> 96
    expectedScore: 96,
    expectedLabel: 'Likely Interview Candidate',
    note: 'Quantified results and a clean requirement match across the board.',
  },
  // -------------------------------------------------------------------------
  {
    id: 'ml-medium-match',
    discipline: 'machine-learning',
    profile: 'medium match',
    jobTitle: 'Machine Learning Engineer',
    jobDescription: [
      'Machine Learning Engineer at Corvid Grid. Own classical ML models end to',
      'end: feature work, training, and deployment to a cloud runtime.',
      'Essential: Python and solid ML fundamentals. Important: deploying models',
      'to a cloud environment. Desirable: distributed processing.',
    ].join(' '),
    cv: [
      'Priya Kettleworth. Data Scientist moving toward ML engineering.',
      'Wrenfield Mutual, Data Scientist (18 months): built churn and propensity',
      'models in Python with scikit-learn, handed trained artefacts to a',
      'platform team for deployment. Ran experiment tracking and wrote the',
      'model cards. No direct ownership of the deployment path.',
      'Nettlebed Polytechnic, BSc Statistics. Tools: Python, scikit-learn,',
      'pandas, SQL, some Spark on a university module.',
    ].join(' '),
    requirements: [
      req('Python', 'skills', 'must_have', 'strong'),
      req('ML fundamentals and scikit-learn', 'skills', 'must_have', 'partial'),
      req('Cloud deployment of models', 'skills', 'important', 'none'),
      req('Distributed processing (Spark)', 'skills', 'nice_to_have', 'partial'),
      req('Owning models end to end', 'experience', 'must_have', 'partial'),
    ],
    evidenceAbility: { appliedEvidence: 'partial', appliedSkill: 'strong', results: 'partial' },
    capability: { skillApplication: 'partial', tools: 'partial', certifications: 'partial' },
    fitCommunication: {
      roleFit: 'partial', valueProposition: 'partial', technicalCommunication: 'strong', cvStructure: 'strong',
    },
    // cat1 = (20*50 + 10*100 + 10*50)/40 = 2500/40 = 62.5 -> 63
    // skills matrix = (3 + 1.5 + 0 + 0.5)/9 = 5/9 -> 56
    // cat2 = (15*56 + 10*50 + 5*50 + 5*50)/35 = 1840/35 -> 53
    // cat3 = (10*50 + 5*50 + 5*100 + 5*100)/25 = 1750/25 = 70
    // 0.4*63 + 0.35*53 + 0.25*70 = 61.25 -> 61
    expectedScore: 61,
    expectedLabel: 'Needs Improvement',
    note: 'Deliberately lands on the 61 band boundary, so an off-by-one in the label thresholds fails here.',
  },
  // -------------------------------------------------------------------------
  {
    id: 'data-weak-match',
    discipline: 'data',
    profile: 'weak match',
    jobTitle: 'Data Engineer',
    jobDescription: [
      'Data Engineer at Thistlewaite Freight. Build and maintain the warehouse',
      'and the pipelines feeding it. Essential: advanced SQL and dimensional',
      'data modelling. Important: Python for pipeline work. Desirable: a BI',
      'tool such as Tableau.',
    ].join(' '),
    cv: [
      'Callum Birchwood. Operations Coordinator seeking a data role.',
      'Thornbury Logistics, Operations Coordinator (3 years): scheduling and',
      'supplier coordination. Built reporting spreadsheets and wrote basic SQL',
      'queries against a reporting replica to pull weekly volumes.',
      'Completed an online introduction to SQL. No pipeline, warehouse or',
      'modelling work. Tools: Excel, basic SQL.',
    ].join(' '),
    requirements: [
      req('Advanced SQL', 'skills', 'must_have', 'partial'),
      req('Dimensional data modelling', 'skills', 'must_have', 'none'),
      req('Python for pipelines', 'skills', 'important', 'partial'),
      req('BI tooling', 'skills', 'nice_to_have', 'none'),
      req('Data engineering experience', 'experience', 'must_have', 'none'),
    ],
    evidenceAbility: { appliedEvidence: 'none', appliedSkill: 'partial', results: 'none' },
    capability: { skillApplication: 'none', tools: 'partial', certifications: 'none' },
    fitCommunication: {
      roleFit: 'none', valueProposition: 'none', technicalCommunication: 'partial', cvStructure: 'partial',
    },
    // cat1 = (0 + 500 + 0)/40 = 12.5 -> 13
    // skills matrix = (1.5 + 0 + 1 + 0)/9 = 2.5/9 -> 28
    // cat2 = (15*28 + 0 + 5*50 + 0)/35 = 670/35 -> 19
    // cat3 = (0 + 0 + 250 + 250)/25 = 20
    // 0.4*13 + 0.35*19 + 0.25*20 = 16.85 -> 17
    expectedScore: 17,
    expectedLabel: 'Not a Fit',
    note: 'Adjacent-domain candidate with no applied evidence. Must stay well under the 61 floor.',
  },
  // -------------------------------------------------------------------------
  {
    id: 'software-career-changer',
    discipline: 'software',
    profile: 'career changer',
    jobTitle: 'Frontend Engineer',
    jobDescription: [
      'Frontend Engineer at Larkspur Retail. Build and maintain the customer',
      'facing storefront. Essential: TypeScript and React. Important: testing',
      'practice. Desirable: familiarity with CI pipelines.',
    ].join(' '),
    cv: [
      'Nadia Colquhoun. Secondary school physics teacher retraining as an engineer.',
      'Bracken Hill School, Physics Teacher (6 years): built and maintained a',
      'React and TypeScript revision platform used across the department, with',
      'component tests and a deployment pipeline she configured herself.',
      'Completed a 14 week intensive software course. Two open source',
      'contributions merged to a component library.',
      'Limited commercial engineering employment; substantial applied build history.',
    ].join(' '),
    requirements: [
      req('TypeScript', 'skills', 'must_have', 'strong'),
      req('React', 'skills', 'must_have', 'strong'),
      req('Testing practice', 'skills', 'important', 'partial'),
      req('CI pipelines', 'skills', 'nice_to_have', 'partial'),
      req('Commercial frontend experience', 'experience', 'must_have', 'partial'),
    ],
    evidenceAbility: { appliedEvidence: 'partial', appliedSkill: 'strong', results: 'partial' },
    capability: { skillApplication: 'strong', tools: 'partial', certifications: 'none' },
    fitCommunication: {
      roleFit: 'partial', valueProposition: 'strong', technicalCommunication: 'strong', cvStructure: 'strong',
    },
    // cat1 = (1000 + 1000 + 500)/40 = 62.5 -> 63
    // skills matrix = (3 + 3 + 1 + 0.5)/9 = 7.5/9 -> 83
    // cat2 = (15*83 + 10*100 + 5*50 + 0)/35 = 2495/35 -> 71
    // cat3 = (500 + 500 + 500 + 500)/25 = 80
    // 0.4*63 + 0.35*71 + 0.25*80 = 70.05 -> 70
    expectedScore: 70,
    expectedLabel: 'Needs Improvement',
    note: 'Non-linear background. Guards the rule that applied work counts even without matching job titles.',
  },
  // -------------------------------------------------------------------------
  {
    id: 'ai-project-heavy-limited-employment',
    discipline: 'ai',
    profile: 'project heavy, limited employment history',
    jobTitle: 'Junior Machine Learning Engineer',
    jobDescription: [
      'Junior Machine Learning Engineer at Ospreygate Labs. Support model',
      'training and evaluation work. Essential: Python and a deep learning',
      'framework. Important: exposure to production deployment. Desirable:',
      'container orchestration.',
    ].join(' '),
    cv: [
      'Tomas Vellacott. Recent graduate, project led portfolio.',
      'Ashcombe University, BSc Artificial Intelligence, first class.',
      'Six substantial personal and academic projects in Python and PyTorch:',
      'an image segmentation model with a written error analysis, a fine tuned',
      'small language model with an evaluation suite, and a Kaggle competition',
      'placing in the top 12 percent. All documented publicly with README',
      'writeups and reproducible training scripts.',
      'Employment: one 3 month university placement. No production deployment',
      'ownership and no orchestration experience.',
    ].join(' '),
    requirements: [
      req('Python', 'skills', 'must_have', 'strong'),
      req('Deep learning framework', 'skills', 'must_have', 'strong'),
      req('Production deployment exposure', 'skills', 'important', 'none'),
      req('Container orchestration', 'skills', 'nice_to_have', 'none'),
      req('Applied ML project work', 'experience', 'must_have', 'strong'),
    ],
    evidenceAbility: { appliedEvidence: 'strong', appliedSkill: 'strong', results: 'partial' },
    capability: { skillApplication: 'strong', tools: 'partial', certifications: 'partial' },
    fitCommunication: {
      roleFit: 'partial', valueProposition: 'strong', technicalCommunication: 'strong', cvStructure: 'partial',
    },
    // cat1 = (2000 + 1000 + 500)/40 = 87.5 -> 88
    // skills matrix = (3 + 3 + 0 + 0)/9 = 6/9 -> 67
    // cat2 = (15*67 + 10*100 + 5*50 + 5*50)/35 = 2505/35 -> 72
    // cat3 = (500 + 500 + 500 + 250)/25 = 70
    // 0.4*88 + 0.35*72 + 0.25*70 = 77.9 -> 78
    expectedScore: 78,
    expectedLabel: 'Needs Improvement',
    note: 'The case category 1 exists for: personal and academic work credited on equal footing with employment.',
  },
  // -------------------------------------------------------------------------
  {
    id: 'data-critical-gap-capped',
    discipline: 'data',
    profile: 'strong on paper, blocked by a critical must have',
    jobTitle: 'Clinical Data Scientist',
    jobDescription: [
      'Clinical Data Scientist at Marlow Vale Trust. Analyse trial data under',
      'a regulated framework. Essential: Python, applied statistics, and',
      'current registration with the national clinical data registry, which is',
      'a legal precondition of the role.',
    ].join(' '),
    cv: [
      'Ines Haverstock. Data Scientist, five years.',
      'Quillon Research, Data Scientist (5 years): survival analysis and',
      'longitudinal modelling in Python for observational health studies,',
      'with published methodology notes and a reproducible analysis pipeline.',
      'Strong applied statistics. Holds no clinical data registry',
      'registration and has never applied for one.',
    ].join(' '),
    requirements: [
      req('Python', 'skills', 'must_have', 'strong'),
      req('Applied statistics', 'skills', 'must_have', 'strong'),
      req('Current clinical data registry registration', 'experience', 'must_have', 'none', true),
    ],
    evidenceAbility: { appliedEvidence: 'strong', appliedSkill: 'strong', results: 'strong' },
    capability: { skillApplication: 'strong', tools: 'strong', certifications: 'none' },
    fitCommunication: {
      roleFit: 'strong', valueProposition: 'strong', technicalCommunication: 'strong', cvStructure: 'strong',
    },
    // cat1 = 100; skills matrix = 6/6 -> 100
    // cat2 = (1500 + 1000 + 500 + 0)/35 = 3000/35 -> 86
    // cat3 = 100
    // raw = 0.4*100 + 0.35*86 + 0.25*100 = 95.1 -> 95
    // critical must_have unmatched -> capped at 49
    expectedScore: 49,
    expectedLabel: 'Not a Fit',
    note: 'Would score 95 without the cap. Proves applyCriticalGapCap still binds on a legal precondition.',
  },
]
