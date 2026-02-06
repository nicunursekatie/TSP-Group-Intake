import { Switch, Route, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import IntakePage from "@/pages/intake";
import AdminPage from "@/pages/admin";
import PendingApproval from "@/pages/pending-approval";
import SettingsPage from "@/pages/settings";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, requireAdmin = false }: { component: React.ComponentType, requireAdmin?: boolean }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#236383] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  if (user.approvalStatus !== 'approved') {
    return <PendingApproval />;
  }

  if (requireAdmin && user.role !== 'admin' && user.role !== 'admin_coordinator') {
    setLocation("/");
    return null;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-[#236383] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/">
        {isAuthenticated && user?.approvalStatus === 'approved' ? (
          <Layout><Dashboard /></Layout>
        ) : isAuthenticated ? (
          <PendingApproval />
        ) : (
          <LandingPage />
        )}
      </Route>
      
      <Route path="/admin">
        <ProtectedRoute component={AdminPage} requireAdmin />
      </Route>
      
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      
      <Route path="/intake/:id">
        <ProtectedRoute component={IntakePage} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
      <Sonner />
    </QueryClientProvider>
  );
}

export default App;
