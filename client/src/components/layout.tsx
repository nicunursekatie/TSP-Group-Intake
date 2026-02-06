import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  LogOut,
  Sandwich,
  Menu,
  Shield,
  Settings
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="bg-[#236383]/10 p-2 rounded-lg">
          <Sandwich className="h-6 w-6 text-[#236383]" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight text-[#236383]">TSP Intake</h1>
          <p className="text-xs text-muted-foreground">Event Management</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Link href="/">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-3",
              location === "/" && "bg-[#236383]/10 text-[#236383] font-medium"
            )}
            data-testid="nav-dashboard"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        {user?.role === 'admin' && (
          <Link href="/admin">
            <Button 
              variant="ghost" 
              className={cn(
                "w-full justify-start gap-3",
                location === "/admin" && "bg-[#a31c41]/10 text-[#a31c41] font-medium"
              )}
              data-testid="nav-admin"
            >
              <Shield className="h-4 w-4" />
              User Management
            </Button>
          </Link>
        )}
        <Link href="/settings">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-3",
              location === "/settings" && "bg-[#236383]/10 text-[#236383] font-medium"
            )}
            data-testid="nav-settings"
          >
            <Settings className="h-4 w-4" />
            Account Settings
          </Button>
        </Link>
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-4 px-2">
          {user?.profileImageUrl ? (
            <img 
              src={user.profileImageUrl} 
              alt={user.firstName || ''} 
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-[#236383]/20 flex items-center justify-center text-[#236383] font-bold">
              {(user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role}</p>
          </div>
        </div>
        <a href="/api/logout">
          <Button 
            variant="outline" 
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:block w-64 h-screen sticky top-0">
        <NavContent />
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background border-b z-50 flex items-center px-4 justify-between">
         <div className="flex items-center gap-2">
            <div className="bg-[#236383]/10 p-1.5 rounded-lg">
              <Sandwich className="h-5 w-5 text-[#236383]" />
            </div>
            <span className="font-bold text-[#236383]">TSP Intake</span>
         </div>
         <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
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
