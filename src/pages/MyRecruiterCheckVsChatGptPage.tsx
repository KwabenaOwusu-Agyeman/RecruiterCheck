import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsChatGptPage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs ChatGPT | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and pasting your CV into ChatGPT: a consistent, structured Interview Score versus a general purpose chat that can drift toward telling you what you want to hear."
      path="/myrecruitercheck-vs-chatgpt"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs ChatGPT"
      introduction="You can paste your CV into ChatGPT for free. MyRecruiterCheck exists to do the one thing a general purpose chat isn't built for: apply the same structured, recruiter style evaluation framework to every check, every time."
      benefits={[
        { title: 'One purpose, one verdict', description: 'Every check is a fresh, single purpose evaluation against fixed criteria, not a chat that remembers being agreeable to you and gets nicer the longer you talk.' },
        { title: 'Same criteria, every check', description: "The scoring framework weighs experience, skills and role fit against the specific job description, using the same structured rules every time, not a generic AI opinion that can vary between prompts." },
        { title: 'Real documents, not chat text', description: 'A downloadable CV draft, cover letter, and recruiter message, not a wall of chat text you have to reformat and fact check yourself.' },
      ]}
      steps={[
        'Upload your CV and paste the job description.',
        'Get a consistent Interview Score with Strengths, Areas to Improve, and Prospects, structured to lead with what\'s working before addressing gaps.',
        'Every claim traces back to your real CV, and your check is saved so you can track it over time.',
      ]}
      comparison={{
        competitor: 'ChatGPT',
        lastReviewed: '26 August 2026',
        rows: [
          { label: 'How the verdict is built', us: 'The same structured scoring framework every time, never softened by a chat history that\'s been agreeing with you', them: 'A general purpose opinion that can drift toward telling you what you want to hear' },
          { label: 'Feedback and documents', us: 'Constructive, structured feedback plus a real downloadable CV draft, cover letter, and recruiter message, every claim traceable to your real CV', them: 'Chat text you reformat yourself, and it can invent plausible sounding details' },
          { label: 'Free access', us: 'First check free, no card required, plus every check saved to track over time', them: 'Free, but general purpose and starts from zero each new chat' },
        ],
      }}
      faqs={[
        { question: 'Why not just paste my CV into ChatGPT for free?', answer: 'You can, and you\'ll get decent generic advice. MyRecruiterCheck is built for this one task specifically: a consistent Interview Score and structured feedback built around the same evidence a recruiter looks for, plus real downloadable documents, not just chat text.' },
        { question: 'Is MyRecruiterCheck\'s feedback more honest than ChatGPT\'s?', answer: 'Each check runs as a fresh, single purpose evaluation, not a multi turn chat. That means it isn\'t shaped by a conversation history that\'s been agreeing with you, which is a real pattern general purpose chat models can drift into the longer a conversation runs.' },
        { question: 'Does MyRecruiterCheck remember my previous checks?', answer: 'On the Power plan, yes, your full check history is saved so you can track applications over time. ChatGPT starts a new conversation from zero each time unless you keep pasting your own context back in.' },
      ]}
      relatedLinks={[
        { label: 'Application Checker', to: '/application-checker' },
        { label: 'Interview Score', to: '/interview-probability-score' },
        { label: 'Pricing', to: '/pricing' },
      ]}
    />
  )
}
