import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Home from '@/pages/Home';
import ActiveCall from '@/pages/ActiveCall';
import CallHistory from '@/pages/CallHistory';
import Scribe from '@/pages/Scribe';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ProtectedRoute from '@/components/ProtectedRoute';
import PrivacyPolicy from '@/pages/PrivacyPolicy';

const PrivacyGate = ({ children }) => {
  const accepted = localStorage.getItem('emit_privacy_accepted') === 'true';
  if (!accepted) {
    return <Navigate to="/privacy-policy" replace />;
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/" element={<PrivacyGate><Home /></PrivacyGate>} />
        <Route path="/call" element={<PrivacyGate><ActiveCall /></PrivacyGate>} />
        <Route path="/call/:callId" element={<PrivacyGate><ActiveCall /></PrivacyGate>} />
        <Route path="/history" element={<PrivacyGate><CallHistory /></PrivacyGate>} />
        <Route path="/scribe" element={<PrivacyGate><Scribe /></PrivacyGate>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App