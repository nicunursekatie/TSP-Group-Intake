import { Switch, Route, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import IntakePage from "@/pages/intake";
import { useStore } from "@/lib/store";
import { useEffect } from "react";
import { useCreateIntakeRecord } from "@/lib/queries";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const user = useStore(state => state.currentUser);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      setLocation("/auth");
    }
  }, [user, setLocation]);

  if (!user) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function NewIntakeRedirect() {
  const createMutation = useCreateIntakeRecord();
  const [, setLocation] = useLocation();
  const user = useStore(state => state.currentUser);

  useEffect(() => {
    if (user) {
      createMutation.mutate({
        organizationName: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        eventDate: null,
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
  }, [user, createMutation, setLocation]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      
      <Route path="/new">
        <ProtectedRoute component={NewIntakeRedirect} />
      </Route>
      
      <Route path="/intake/:id">
        <ProtectedRoute component={IntakePage} />
      </Route>
      
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <>
      <Router />
      <Toaster />
      <Sonner />
    </>
  );
}

export default App;
