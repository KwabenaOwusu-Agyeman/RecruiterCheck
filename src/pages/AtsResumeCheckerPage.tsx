import { SeoLandingPage } from '@/pages/SeoLandingPage'

export function AtsResumeCheckerPage() {
  return (
    <SeoLandingPage
      title="ATS Resume Checker and Job Match | MyRecruiterCheck"
      description="Check whether your resume clearly matches the job title, skills, experience and responsibilities in a job description before you apply."
      path="/ats-resume-checker"
      eyebrow="ATS Resume Checker"
      heading="Check whether your resume matches the job"
      introduction="Find missing job requirements, unclear evidence and weak alignment before your application reaches a recruiter."
      directAnswer="Most ATS resume checkers only count how many keywords from the job description appear somewhere in your resume. That tells you very little, because a resume can contain every keyword and still read as vague or unconvincing to the person deciding whether to interview you. MyRecruiterCheck starts the same way — comparing your resume against the job title, required skills, experience level and stated responsibilities — but then goes a step further. It looks at whether each requirement is actually supported by evidence in your resume: a specific project, a result, a tool you used in context, rather than the word appearing once in a skills list. The output separates what's genuinely aligned, what's present but weakly supported, and what's missing entirely, so you know exactly what to fix before you submit the application, not after you've been rejected without explanation."
      benefits={[
        { title: 'Review job alignment', description: 'See whether your resume reflects the exact role, seniority, skills and responsibilities in this vacancy — not a generic version of the job title.' },
        { title: 'Find missing evidence', description: 'Identify requirements that are absent, unclear, or only implied, so you can add specific detail before a recruiter reads it.' },
        { title: 'Write for recruiters too', description: 'Improve relevance without turning your resume into a keyword list — evidence that satisfies an ATS should also read naturally to a person.' },
      ]}
      steps={[
        'Upload the resume you plan to submit.',
        'Add the complete job description, not just the title.',
        'Review the match evidence, requirement by requirement, and strengthen the weak ones before applying.',
      ]}
      example={{
        title: 'A worked example',
        scenario: 'A candidate applying for a "Senior Data Analyst" role listed "SQL, Python, stakeholder reporting" in their skills section, matching three keywords from the posting. The job description also specified "3+ years leading analytics for a cross-functional team" and "experience presenting findings to non-technical stakeholders."',
        insight: 'The keyword match alone looked strong. But the resume had no mention of team leadership, and "stakeholder reporting" was never tied to a concrete example. MyRecruiterCheck flagged both as unsupported requirements, not missing keywords — the fix was adding one line about leading a three-person analytics pod and one sentence describing a specific stakeholder presentation, not stuffing in more synonyms.',
      }}
      faqs={[
        { question: 'What does an ATS resume checker look for?', answer: 'It checks whether your resume reflects important information in the vacancy, such as the job title, skills, qualifications, experience and responsibilities.' },
        { question: 'Is an ATS score the same as an interview chance?', answer: 'No. ATS alignment helps your application remain relevant, but recruiters also assess the quality, credibility and value of your experience. MyRecruiterCheck considers both alignment and recruiter-facing evidence.' },
        { question: 'Should I copy every keyword from the job description?', answer: 'No. Include only skills and experience you genuinely have. Support important requirements with clear evidence and results wherever possible — an ATS pass that leads to a rejected interview wastes everyone\'s time.' },
        { question: 'Can this guarantee that my resume passes an ATS?', answer: 'No tool can guarantee that outcome because employers configure their systems differently. The check helps you improve relevant alignment before submitting.' },
        { question: 'How is this different from a plain keyword-matching tool?', answer: 'Keyword tools count occurrences. MyRecruiterCheck evaluates whether each requirement is actually supported by evidence in your resume, and explains what a recruiter would still want to see.' },
      ]}
      relatedLinks={[
        { label: 'Free CV Checker', to: '/free-cv-checker' },
        { label: 'CV Job Match', to: '/resume-job-description-match' },
        { label: 'Interview Score', to: '/interview-probability-score' },
        { label: 'Application Checker', to: '/application-checker' },
      ]}
    />
  )
}
