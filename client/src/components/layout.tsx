import { Link, useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  FilePlus, 
  CheckSquare, 
  LogOut, 
  Sandwich, 
  User as UserIcon,
  Menu
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const logout = useStore(state => state.logout);
  const user = useStore(state => state.currentUser);
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="bg-primary/10 p-2 rounded-lg">
          <Sandwich className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight">TSP Intake</h1>
          <p className="text-xs text-muted-foreground">Event Management</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Link href="/">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-3",
              location === "/" && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <Link href="/new">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-3",
              location === "/new" && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
          >
            <FilePlus className="h-4 w-4" />
            New Intake
          </Button>
        </Link>
        {/* Tasks could be a modal or side panel, but linking for now if we build a dedicated page */}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="h-8 w-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary-foreground font-bold">
            {user?.name?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role}</p>
          </div>
        </div>
        <Button variant="outline" className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 h-screen sticky top-0">
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background border-b z-50 flex items-center px-4 justify-between">
         <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-lg">
              <Sandwich className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold">TSP Intake</span>
         </div>
         <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <NavContent />
            </SheetContent>
         </Sheet>
      </div>

      <main className="flex-1 min-w-0 md:p-0 pt-16">
        {children}
      </main>
    </div>
  );
}
