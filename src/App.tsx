import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/hooks/useAuth'
import { AppLayout } from '@/layouts/AppLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AccountPage } from '@/pages/AccountPage'
import { AtsResumeCheckerPage } from '@/pages/AtsResumeCheckerPage'
import { ApplicationCheckerPage } from '@/pages/ApplicationCheckerPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { BillingPage } from '@/pages/BillingPage'
import { CoverLetterGeneratorPage } from '@/pages/CoverLetterGeneratorPage'
import { CvKeywordCheckerPage } from '@/pages/CvKeywordCheckerPage'
import { DisclaimerPage } from '@/pages/DisclaimerPage'
import { ExampleCheckPage } from '@/pages/ExampleCheckPage'
import { ExtensionConnectPage } from '@/pages/ExtensionConnectPage'
import { FaqPage } from '@/pages/FaqPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { FreeCvCheckerPage } from '@/pages/FreeCvCheckerPage'
import { LandingPage } from '@/pages/LandingPage'
import { InterviewProbabilityPage } from '@/pages/InterviewProbabilityPage'
import { JobApplicationFeedbackPage } from '@/pages/JobApplicationFeedbackPage'
import { MyChecksPage } from '@/pages/MyChecksPage'
import { NewCheckPage } from '@/pages/NewCheckPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RecruiterMessageGeneratorPage } from '@/pages/RecruiterMessageGeneratorPage'
import { ResumeStrengthsWeaknessesPage } from '@/pages/ResumeStrengthsWeaknessesPage'
import { ResumeJobMatchPage } from '@/pages/ResumeJobMatchPage'
import { TailorCvToJobPage } from '@/pages/TailorCvToJobPage'
import { TermsPage } from '@/pages/TermsPage'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="sign-in" element={<LandingPage />} />
            <Route path="sign-up" element={<LandingPage />} />
            <Route path="example-check" element={<ExampleCheckPage />} />
            <Route path="application-checker" element={<ApplicationCheckerPage />} />
            <Route path="free-cv-checker" element={<FreeCvCheckerPage />} />
            <Route path="ats-resume-checker" element={<AtsResumeCheckerPage />} />
            <Route path="tailor-cv-to-job-description" element={<TailorCvToJobPage />} />
            <Route path="cv-keyword-checker" element={<CvKeywordCheckerPage />} />
            <Route path="cover-letter-generator" element={<CoverLetterGeneratorPage />} />
            <Route path="recruiter-message-generator" element={<RecruiterMessageGeneratorPage />} />
            <Route path="resume-strengths-and-weaknesses" element={<ResumeStrengthsWeaknessesPage />} />
            <Route path="job-application-feedback" element={<JobApplicationFeedbackPage />} />
            <Route path="resume-job-description-match" element={<ResumeJobMatchPage />} />
            <Route path="interview-probability-score" element={<InterviewProbabilityPage />} />
          </Route>

          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="disclaimer" element={<DisclaimerPage />} />
          <Route path="faq" element={<FaqPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="checks" element={<MyChecksPage />} />
              <Route path="checks/new" element={<NewCheckPage />} />
              <Route path="checks/:id/edit" element={<NewCheckPage />} />
              <Route path="checks/:id" element={<FeedbackPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="account/billing" element={<BillingPage />} />
              <Route path="extension/connect" element={<ExtensionConnectPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
