import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ScrollToTop } from '@/components/ScrollToTop'
import { AuthProvider } from '@/hooks/useAuth'
import { AppLayout } from '@/layouts/AppLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AccountPage } from '@/pages/AccountPage'
import { AboutPage } from '@/pages/AboutPage'
import { AiEngineerCvCheckerPage } from '@/pages/AiEngineerCvCheckerPage'
import { AtsResumeCheckerPage } from '@/pages/AtsResumeCheckerPage'
import { ApplicationCheckerPage } from '@/pages/ApplicationCheckerPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { CookiePage } from '@/pages/CookiePage'
import { CoverLetterGeneratorPage } from '@/pages/CoverLetterGeneratorPage'
import { CvKeywordCheckerPage } from '@/pages/CvKeywordCheckerPage'
import { DataAnalystCvCheckerPage } from '@/pages/DataAnalystCvCheckerPage'
import { DataScientistCvCheckerPage } from '@/pages/DataScientistCvCheckerPage'
import { DisclaimerPage } from '@/pages/DisclaimerPage'
import { ExtensionConnectPage } from '@/pages/ExtensionConnectPage'
import { FaqPage } from '@/pages/FaqPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { FreeCvCheckerPage } from '@/pages/FreeCvCheckerPage'
import { HowInterviewScoreWorksPage } from '@/pages/HowInterviewScoreWorksPage'
import { LandingPage } from '@/pages/LandingPage'
import { InterviewProbabilityPage } from '@/pages/InterviewProbabilityPage'
import { JobApplicationFeedbackPage } from '@/pages/JobApplicationFeedbackPage'
import { KeywordScanPage } from '@/pages/KeywordScanPage'
import { MachineLearningEngineerCvCheckerPage } from '@/pages/MachineLearningEngineerCvCheckerPage'
import { MyChecksPage } from '@/pages/MyChecksPage'
import { MyRecruiterCheckVsJobscanPage } from '@/pages/MyRecruiterCheckVsJobscanPage'
import { MyRecruiterCheckVsChatGptPage } from '@/pages/MyRecruiterCheckVsChatGptPage'
import { MyRecruiterCheckVsKickresumePage } from '@/pages/MyRecruiterCheckVsKickresumePage'
import { MyRecruiterCheckVsReziPage } from '@/pages/MyRecruiterCheckVsReziPage'
import { MyRecruiterCheckVsResumeWordedPage } from '@/pages/MyRecruiterCheckVsResumeWordedPage'
import { MyRecruiterCheckVsTealPage } from '@/pages/MyRecruiterCheckVsTealPage'
import { NewCheckPage } from '@/pages/NewCheckPage'
import { NewsletterUnsubscribePage } from '@/pages/NewsletterUnsubscribePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PricingPage } from '@/pages/PricingPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RecruiterEvaluationPage } from '@/pages/RecruiterEvaluationPage'
import { RecruiterMessageGeneratorPage } from '@/pages/RecruiterMessageGeneratorPage'
import { ResumeStrengthsWeaknessesPage } from '@/pages/ResumeStrengthsWeaknessesPage'
import { ResumeJobMatchPage } from '@/pages/ResumeJobMatchPage'
import { SoftwareEngineerResumeCheckerPage } from '@/pages/SoftwareEngineerResumeCheckerPage'
import { TailorCvToJobPage } from '@/pages/TailorCvToJobPage'
import { TermsPage } from '@/pages/TermsPage'

/**
 * Carries the query string across the redirect. A Stripe session created
 * before the return URLs moved to /pricing still comes back to
 * /account/billing?status=success, and a bare <Navigate> would drop that
 * param — so the page would not know to re-fetch the new balance.
 */
function BillingRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/pricing', search }} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="sign-in" element={<LandingPage />} />
        <Route path="sign-up" element={<LandingPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="application-checker" element={<ApplicationCheckerPage />} />
        <Route path="free-cv-checker" element={<FreeCvCheckerPage />} />
        <Route path="ats-resume-checker" element={<AtsResumeCheckerPage />} />
        <Route path="tailor-cv-to-job-description" element={<TailorCvToJobPage />} />
        <Route path="cv-keyword-checker" element={<CvKeywordCheckerPage />} />
        <Route path="cover-letter-generator" element={<CoverLetterGeneratorPage />} />
        <Route path="recruiter-message-generator" element={<RecruiterMessageGeneratorPage />} />
        <Route path="resume-strengths-and-weaknesses" element={<ResumeStrengthsWeaknessesPage />} />
        <Route path="job-application-feedback" element={<JobApplicationFeedbackPage />} />
        <Route path="how-recruiters-evaluate-a-cv" element={<RecruiterEvaluationPage />} />
        <Route path="resume-job-description-match" element={<ResumeJobMatchPage />} />
        <Route path="interview-probability-score" element={<InterviewProbabilityPage />} />
        <Route path="how-interview-score-works" element={<HowInterviewScoreWorksPage />} />
        <Route path="software-engineer-resume-checker" element={<SoftwareEngineerResumeCheckerPage />} />
        <Route path="data-analyst-cv-checker" element={<DataAnalystCvCheckerPage />} />
        <Route path="data-scientist-cv-checker" element={<DataScientistCvCheckerPage />} />
        <Route path="machine-learning-engineer-cv-checker" element={<MachineLearningEngineerCvCheckerPage />} />
        <Route path="ai-engineer-cv-checker" element={<AiEngineerCvCheckerPage />} />
        <Route path="myrecruitercheck-vs-jobscan" element={<MyRecruiterCheckVsJobscanPage />} />
        <Route path="myrecruitercheck-vs-resume-worded" element={<MyRecruiterCheckVsResumeWordedPage />} />
        <Route path="myrecruitercheck-vs-teal" element={<MyRecruiterCheckVsTealPage />} />
        <Route path="myrecruitercheck-vs-rezi" element={<MyRecruiterCheckVsReziPage />} />
        <Route path="myrecruitercheck-vs-kickresume" element={<MyRecruiterCheckVsKickresumePage />} />
        <Route path="myrecruitercheck-vs-chatgpt" element={<MyRecruiterCheckVsChatGptPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="auth/callback" element={<AuthCallbackPage />} />
      <Route path="auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="terms" element={<TermsPage />} />
      <Route path="privacy" element={<PrivacyPage />} />
      <Route path="cookies" element={<CookiePage />} />
      <Route path="disclaimer" element={<DisclaimerPage />} />
      <Route path="faq" element={<FaqPage />} />
      {/* Billing merged into /pricing, which is public and prerendered. Kept
          as a redirect so old bookmarks and any Stripe session still carrying
          the previous return URL land somewhere sensible. Deliberately OUTSIDE
          ProtectedRoute: the destination is public, so a signed-out visitor
          should reach the prices rather than be bounced to sign-in. */}
      <Route path="account/billing" element={<BillingRedirect />} />
      <Route path="newsletter/unsubscribe" element={<NewsletterUnsubscribePage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="checks" element={<MyChecksPage />} />
          <Route path="checks/keyword-scan" element={<KeywordScanPage />} />
          <Route path="checks/new" element={<NewCheckPage />} />
          <Route path="checks/:id/edit" element={<NewCheckPage />} />
          <Route path="checks/:id" element={<FeedbackPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="extension/connect" element={<ExtensionConnectPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
