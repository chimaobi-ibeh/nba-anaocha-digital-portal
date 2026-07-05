import { Suspense, useEffect } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import SplashScreen from "@/components/SplashScreen";
import ErrorBoundary from "@/components/ErrorBoundary";

// Eager: landing, auth, shell
import Index from "./pages/Index.tsx";
import DashboardRedirect from "./pages/DashboardRedirect.tsx";
import NotFound from "./pages/NotFound.tsx";
import SignIn from "./pages/auth/SignIn.tsx";
import SignUp from "./pages/auth/SignUp.tsx";
import ForgotPassword from "./pages/auth/ForgotPassword.tsx";
import ResetPassword from "./pages/auth/ResetPassword.tsx";
import CompleteProfile from "./pages/auth/CompleteProfile.tsx";

// Lazy: anaocha portal
const AnaochaDashboard    = lazyWithRetry(() => import("./pages/anaocha/AnaochaDashboard.tsx"));
const ApplyForServices    = lazyWithRetry(() => import("./pages/anaocha/ApplyForServices.tsx"));
const MyApplications      = lazyWithRetry(() => import("./pages/anaocha/MyApplications.tsx"));
const FindMember          = lazyWithRetry(() => import("./pages/anaocha/FindMember.tsx"));
const MyProfile           = lazyWithRetry(() => import("./pages/anaocha/MyProfile.tsx"));
const Settings            = lazyWithRetry(() => import("./pages/anaocha/Settings.tsx"));
const ContactUs           = lazyWithRetry(() => import("./pages/anaocha/ContactUs.tsx"));
const Notifications       = lazyWithRetry(() => import("./pages/anaocha/Notifications.tsx"));
const AnaochaPayments     = lazyWithRetry(() => import("./pages/anaocha/AnaochaPayments.tsx"));
const MyDues              = lazyWithRetry(() => import("./pages/anaocha/MyDues.tsx"));
const AboutBranch         = lazyWithRetry(() => import("./pages/anaocha/AboutBranch.tsx"));
const Resources           = lazyWithRetry(() => import("./pages/Resources.tsx"));
const PrivacyPolicy       = lazyWithRetry(() => import("./pages/PrivacyPolicy.tsx"));
const TermsOfService      = lazyWithRetry(() => import("./pages/TermsOfService.tsx"));

// Lazy: admin
const AdminDashboard    = lazyWithRetry(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminApplications = lazyWithRetry(() => import("./pages/admin/AdminApplications.tsx"));
const AdminMembers      = lazyWithRetry(() => import("./pages/admin/AdminMembers.tsx"));
const AdminProfileChanges = lazyWithRetry(() => import("./pages/admin/AdminProfileChanges.tsx"));
const AdminNotify       = lazyWithRetry(() => import("./pages/admin/AdminNotify.tsx"));
const AdminContacts     = lazyWithRetry(() => import("./pages/admin/AdminContacts.tsx"));
const AdminAnnouncements = lazyWithRetry(() => import("./pages/admin/AdminAnnouncements.tsx"));
const AdminResources    = lazyWithRetry(() => import("./pages/admin/AdminResources.tsx"));
const AdminLeadership   = lazyWithRetry(() => import("./pages/admin/AdminLeadership.tsx"));
const AdminAuditLogs    = lazyWithRetry(() => import("./pages/admin/AdminAuditLogs.tsx"));
const AdminDues         = lazyWithRetry(() => import("./pages/admin/AdminDues.tsx"));
const AdminReporting    = lazyWithRetry(() => import("./pages/admin/AdminReporting.tsx"));

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      onError: (error) => {
        console.error('[QueryClient mutation error]', error);
      },
    },
  },
});

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <SplashScreen>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<DashboardRedirect />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />

              {/* Auth routes */}
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />

              {/* NBA Anaocha Module - Protected */}
              <Route path="/anaocha/dashboard" element={<ProtectedRoute><AnaochaDashboard /></ProtectedRoute>} />
              <Route path="/anaocha/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
              <Route path="/anaocha/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/anaocha/apply" element={<ProtectedRoute><ApplyForServices /></ProtectedRoute>} />
              <Route path="/anaocha/applications" element={<ProtectedRoute><MyApplications /></ProtectedRoute>} />
              <Route path="/anaocha/dues"     element={<ProtectedRoute><MyDues /></ProtectedRoute>} />
              <Route path="/anaocha/payments" element={<ProtectedRoute><AnaochaPayments /></ProtectedRoute>} />
              <Route path="/anaocha/members" element={<ProtectedRoute><FindMember /></ProtectedRoute>} />
              <Route path="/anaocha/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="/anaocha/contact" element={<ContactUs />} />
              <Route path="/anaocha/about" element={<ProtectedRoute><AboutBranch /></ProtectedRoute>} />

              {/* Admin Module */}
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/applications" element={<AdminRoute><AdminApplications /></AdminRoute>} />
              <Route path="/admin/members" element={<AdminRoute><AdminMembers /></AdminRoute>} />
              <Route path="/admin/profile-changes" element={<AdminRoute><AdminProfileChanges /></AdminRoute>} />
              <Route path="/admin/contacts" element={<AdminRoute><AdminContacts /></AdminRoute>} />
              <Route path="/admin/notify" element={<AdminRoute><AdminNotify /></AdminRoute>} />
              <Route path="/admin/announcements" element={<AdminRoute><AdminAnnouncements /></AdminRoute>} />
              <Route path="/admin/resources" element={<AdminRoute><AdminResources /></AdminRoute>} />
              <Route path="/admin/leadership" element={<AdminRoute><AdminLeadership /></AdminRoute>} />
              <Route path="/admin/dues"       element={<AdminRoute><AdminDues /></AdminRoute>} />
              <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
              <Route path="/admin/reporting" element={<AdminRoute><AdminReporting /></AdminRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </SplashScreen>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
