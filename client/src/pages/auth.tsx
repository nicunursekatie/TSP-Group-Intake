import { useState } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sandwich, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useStore(state => state.login);
  const [, setLocation] = useLocation();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate network delay
    setTimeout(() => {
      const success = login(email);
      setLoading(false);
      
      if (success) {
        toast.success("Welcome back!");
        setLocation("/");
      } else {
        toast.error("User not found. Try 'owner@tsp.org' or 'admin@tsp.org'");
      }
    }, 800);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-4 flex flex-col items-center text-center">
          <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-2">
            <Sandwich className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold text-primary">TSP Intake Portal</CardTitle>
            <CardDescription>
              Enter your email to access the event management system
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 text-center text-sm text-muted-foreground bg-muted/30 p-6 rounded-b-xl border-t">
          <p>Demo Credentials:</p>
          <div className="flex gap-2 justify-center">
            <code 
              className="bg-background border rounded px-2 py-1 cursor-pointer hover:border-primary"
              onClick={() => setEmail('owner@tsp.org')}
            >
              owner@tsp.org
            </code>
            <code 
              className="bg-background border rounded px-2 py-1 cursor-pointer hover:border-primary"
              onClick={() => setEmail('admin@tsp.org')}
            >
              admin@tsp.org
            </code>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
