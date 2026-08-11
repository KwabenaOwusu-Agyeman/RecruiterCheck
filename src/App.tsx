import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/hooks/useAuth'
import { AppLayout } from '@/layouts/AppLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AccountPage } from '@/pages/AccountPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { BillingPage } from '@/pages/BillingPage'
import { DisclaimerPage } from '@/pages/DisclaimerPage'
import { ExtensionConnectPage } from '@/pages/ExtensionConnectPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { LandingPage } from '@/pages/LandingPage'
import { MyChecksPage } from '@/pages/MyChecksPage'
import { NewCheckPage } from '@/pages/NewCheckPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
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
          </Route>

          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="disclaimer" element={<DisclaimerPage />} />

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
