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

// Helper to create a new intake and redirect
function NewIntakeRedirect() {
  const addIntake = useStore(state => state.addIntake);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const id = addIntake({
      organizationName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      eventDate: "",
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
      ownerId: null,
      flags: [],
      internalNotes: ""
    });
    setLocation(`/intake/${id}`);
  }, [addIntake, setLocation]);

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
