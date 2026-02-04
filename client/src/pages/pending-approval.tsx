import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function PendingApproval() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#236383] via-[#007e8c] to-[#47b3cb] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-[#fbad3f] rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl text-[#236383]">Account Pending Approval</CardTitle>
          <CardDescription className="text-base">
            Thank you for signing up, {user?.firstName || 'there'}!
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            Your account is currently awaiting approval from an administrator. 
            You'll be able to access the system once your account has been approved.
          </p>
          <p className="text-sm text-gray-500">
            If you believe this is an error or need immediate access, 
            please contact your organization administrator.
          </p>
          <div className="pt-4">
            <a href="/api/logout">
              <Button variant="outline" className="gap-2" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
