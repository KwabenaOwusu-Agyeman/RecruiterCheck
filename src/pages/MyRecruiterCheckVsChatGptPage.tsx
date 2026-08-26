import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function MyRecruiterCheckVsChatGptPage() {
  return (
    <SeoLandingPage
      title="MyRecruiterCheck vs ChatGPT | MyRecruiterCheck"
      description="Compare MyRecruiterCheck and pasting your CV into ChatGPT: a consistent, recruiter-shaped Interview Score versus a general-purpose chat that can drift toward telling you what you want to hear."
      path="/myrecruitercheck-vs-chatgpt"
      eyebrow="Comparison"
      heading="MyRecruiterCheck vs ChatGPT"
      introduction="You can paste your CV into ChatGPT for free. MyRecruiterCheck exists to do the one thing a general-purpose chat isn't built for: give you the same honest, structured verdict every time, shaped by how real recruiters actually screen candidates."
      benefits={[
        { title: 'One purpose, one verdict', description: 'Every check is a fresh, single-purpose evaluation against fixed criteria, not a chat that remembers being agreeable to you and gets nicer the longer you talk.' },
        { title: 'Shaped by real recruiters', description: "The scoring and feedback approach was shaped by conversations with real recruiters about how they actually screen candidates, not a generic AI opinion. It's refined over time from real user feedback too." },
        { title: 'Real documents, not chat text', description: 'A downloadable, ATS-safe CV draft, cover letter, and recruiter message, not a wall of chat text you have to reformat and fact-check yourself.' },
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
          { label: 'How the verdict is built', us: 'Shaped by real recruiter input, never softened by a chat history that\'s been agreeing with you', them: 'A general-purpose opinion that can drift toward telling you what you want to hear' },
          { label: 'Feedback and documents', us: 'Constructive, structured feedback plus a real downloadable CV draft, cover letter, and recruiter message, every claim traceable to your real CV', them: 'Chat text you reformat yourself, and it can invent plausible-sounding details' },
          { label: 'Free access', us: 'First check free, no card required, plus every check saved to track over time', them: 'Free, but general-purpose and starts from zero each new chat' },
        ],
      }}
      faqs={[
        { question: 'Why not just paste my CV into ChatGPT for free?', answer: 'You can, and you\'ll get decent generic advice. MyRecruiterCheck is built for this one task specifically: a consistent Interview Score and structured feedback shaped by how real recruiters screen candidates, plus real downloadable documents, not just chat text.' },
        { question: 'Is MyRecruiterCheck\'s feedback more honest than ChatGPT\'s?', answer: 'Each check runs as a fresh, single-purpose evaluation, not a multi-turn chat. That means it isn\'t shaped by a conversation history that\'s been agreeing with you, which is a real pattern general-purpose chat models can drift into the longer a conversation runs.' },
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
