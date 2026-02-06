import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Users, Calendar } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#236383] via-[#007e8c] to-[#47b3cb]">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#fbad3f] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">TSP</span>
              </div>
              <span className="text-white font-semibold text-lg">The Sandwich Project</span>
            </div>
            <a href="/login">
              <Button
                variant="secondary"
                className="bg-white text-[#236383] hover:bg-[#fbad3f] hover:text-white transition-colors"
                data-testid="button-login"
              >
                Sign In
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              Event Intake Workflow
            </h1>
            <p className="text-xl text-white/80 max-w-2xl mx-auto mb-8">
              Streamline your event coordination with our powerful intake management system.
              Track requests, manage communications, and ensure every event runs smoothly.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <Card className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors">
              <CardContent className="pt-8 text-center">
                <div className="w-16 h-16 bg-[#fbad3f] rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <ClipboardList className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Intake Management</h3>
                <p className="text-white/70">
                  Capture and organize event requests with our intuitive Call Mode worksheet interface.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors">
              <CardContent className="pt-8 text-center">
                <div className="w-16 h-16 bg-[#007e8c] rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Auto-Generated Tasks</h3>
                <p className="text-white/70">
                  Automatic task creation based on event dates ensures nothing falls through the cracks.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors">
              <CardContent className="pt-8 text-center">
                <div className="w-16 h-16 bg-[#a31c41] rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Team Collaboration</h3>
                <p className="text-white/70">
                  Single-owner editing with admin override ensures clear accountability and smooth handoffs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="bg-black/20 backdrop-blur py-8 text-center text-white/60">
        <p>&copy; {new Date().getFullYear()} The Sandwich Project. All rights reserved.</p>
      </footer>
    </div>
  );
}
