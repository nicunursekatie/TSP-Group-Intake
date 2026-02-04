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
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useCreateIntakeRecord } from "@/lib/queries";

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

  if (requireAdmin && user.role !== 'admin') {
    setLocation("/");
    return null;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function NewIntakeRedirect() {
  const createMutation = useCreateIntakeRecord();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.approvalStatus === 'approved') {
      createMutation.mutate({
        organizationName: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        eventDate: undefined,
        eventTime: "",
        location: "",
        attendeeCount: 0,
        sandwichCount: 0,
        dietaryRestrictions: "",
        requiresRefrigeration: false,
        hasIndoorSpace: true,
        hasRefrigeration: false,
        deliveryInstructions: "",
        status: "New",
        ownerId: user.id,
        flags: [],
        internalNotes: "",
        lastEditedBy: user.id,
      }, {
        onSuccess: (record) => {
          setLocation(`/intake/${record.id}`);
        }
      });
    }
  }, [user]);

  return null;
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
      
      <Route path="/new">
        <ProtectedRoute component={NewIntakeRedirect} />
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
