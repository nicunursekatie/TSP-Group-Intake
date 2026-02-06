import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Settings, 
  Mail, 
  Phone, 
  Bell, 
  MessageSquare, 
  Send,
  Check,
  Loader2,
  ExternalLink
} from "lucide-react";

interface UserSettings {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  platformUserId: string | null;
  smsAlertsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  notifyOnNewIntake: boolean;
  notifyOnTaskDue: boolean;
  notifyOnStatusChange: boolean;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [phoneInput, setPhoneInput] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [platformIdInput, setPlatformIdInput] = useState("");

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<UserSettings>) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Settings updated");
    },
    onError: () => {
      toast.error("Failed to update settings");
    },
  });

  const verifyPhoneMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const res = await fetch("/api/settings/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phoneNumber }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send verification");
      }
      return res.json();
    },
    onSuccess: () => {
      setIsVerifying(true);
      toast.success("Verification code sent to your phone");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const confirmPhoneMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/settings/confirm-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to verify");
      }
      return res.json();
    },
    onSuccess: () => {
      setIsVerifying(false);
      setPhoneInput("");
      setVerificationCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Phone number verified!");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send test email");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Test email sent! Check your inbox.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const lookupPlatformIdMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/lookup-platform-id", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to look up platform ID");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success(`Platform ID linked: ${data.platformUserId}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const testSmsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/test-sms", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send test SMS");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Test SMS sent! Check your phone.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-[#236383] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-[#236383]" />
        <div>
          <h1 className="text-2xl font-bold text-[#236383]">Account Settings</h1>
          <p className="text-gray-600">Manage your account and notification preferences</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#007e8c]" />
            Account Information
          </CardTitle>
          <CardDescription>Your sign-in email and profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-500">First Name</Label>
              <p className="font-medium">{settings?.firstName || "Not set"}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-500">Last Name</Label>
              <p className="font-medium">{settings?.lastName || "Not set"}</p>
            </div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Sign-in Email</Label>
            <p className="font-medium">{settings?.email || "No email"}</p>
          </div>
          <div className="pt-2">
            <p className="text-sm text-gray-500">
              Your account is managed through Replit Auth. To change your password or email, 
              visit your <a href="https://replit.com/account" target="_blank" rel="noopener noreferrer" className="text-[#236383] hover:underline inline-flex items-center gap-1">
                Replit account settings <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-[#007e8c]" />
            Platform Sync
          </CardTitle>
          <CardDescription>Link your account to the main Sandwich Project platform to sync your assigned events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.platformUserId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-sm">Platform ID linked</p>
                    <p className="text-xs text-gray-500 font-mono">{settings.platformUserId}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateSettingsMutation.mutate({ platformUserId: null } as any);
                  }}
                  data-testid="button-remove-platform-id"
                >
                  Remove
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                When you sync, the app will pull events assigned to you on the main platform.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Click below to automatically find your platform account using your email address.
                </p>
                <Button
                  onClick={() => lookupPlatformIdMutation.mutate()}
                  disabled={lookupPlatformIdMutation.isPending}
                  className="bg-[#236383] hover:bg-[#1a4a63] w-full"
                  data-testid="button-auto-link-platform"
                >
                  {lookupPlatformIdMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Looking up your account...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Auto-Link My Platform Account
                    </>
                  )}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">or enter manually</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  If auto-link doesn't work, enter your platform user ID manually. It looks like <span className="font-mono text-xs bg-gray-100 px-1 rounded">user_1234567890_abcdef</span>
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. user_1756855060322_pbabb7eby"
                    value={platformIdInput}
                    onChange={(e) => setPlatformIdInput(e.target.value)}
                    data-testid="input-platform-user-id"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (platformIdInput.trim()) {
                        updateSettingsMutation.mutate({ platformUserId: platformIdInput.trim() } as any);
                        setPlatformIdInput("");
                      }
                    }}
                    disabled={!platformIdInput.trim() || updateSettingsMutation.isPending}
                    data-testid="button-save-platform-id"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Link"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-[#007e8c]" />
            SMS Alerts
          </CardTitle>
          <CardDescription>Set up your phone number for SMS notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.phoneNumber ? (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                <span className="font-medium">{settings.phoneNumber}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  updateSettingsMutation.mutate({ phoneNumber: null, smsAlertsEnabled: false });
                }}
                data-testid="button-remove-phone"
              >
                Remove
              </Button>
            </div>
          ) : isVerifying ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Enter the verification code sent to your phone:</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength={6}
                  data-testid="input-verification-code"
                />
                <Button
                  onClick={() => confirmPhoneMutation.mutate(verificationCode)}
                  disabled={verificationCode.length !== 6 || confirmPhoneMutation.isPending}
                  data-testid="button-confirm-code"
                >
                  {confirmPhoneMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsVerifying(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="+1 (555) 123-4567"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  data-testid="input-phone-number"
                />
                <Button
                  onClick={() => verifyPhoneMutation.mutate(phoneInput)}
                  disabled={!phoneInput || verifyPhoneMutation.isPending}
                  data-testid="button-verify-phone"
                >
                  {verifyPhoneMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                We'll send a verification code to confirm your phone number
              </p>
            </div>
          )}

          {settings?.phoneNumber && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable SMS Alerts</Label>
                  <p className="text-sm text-gray-500">Receive text messages for important updates</p>
                </div>
                <Switch
                  checked={settings?.smsAlertsEnabled}
                  onCheckedChange={(checked) => updateSettingsMutation.mutate({ smsAlertsEnabled: checked })}
                  data-testid="switch-sms-alerts"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testSmsMutation.mutate()}
                disabled={!settings?.smsAlertsEnabled || testSmsMutation.isPending}
                data-testid="button-test-sms"
              >
                {testSmsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Send Test SMS
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#007e8c]" />
            Email Notifications
          </CardTitle>
          <CardDescription>Configure when you receive email alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Email Notifications</Label>
              <p className="text-sm text-gray-500">Receive emails for important updates</p>
            </div>
            <Switch
              checked={settings?.emailNotificationsEnabled}
              onCheckedChange={(checked) => updateSettingsMutation.mutate({ emailNotificationsEnabled: checked })}
              data-testid="switch-email-notifications"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => testEmailMutation.mutate()}
            disabled={!settings?.emailNotificationsEnabled || testEmailMutation.isPending}
            data-testid="button-test-email"
          >
            {testEmailMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Test Email
          </Button>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium">Notification Types</h4>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <Label>New Intake Records</Label>
                <p className="text-sm text-gray-500">When new event requests are created</p>
              </div>
              <Switch
                checked={settings?.notifyOnNewIntake}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ notifyOnNewIntake: checked })}
                disabled={!settings?.emailNotificationsEnabled}
                data-testid="switch-notify-new-intake"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Task Due Reminders</Label>
                <p className="text-sm text-gray-500">When tasks are approaching their due date</p>
              </div>
              <Switch
                checked={settings?.notifyOnTaskDue}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ notifyOnTaskDue: checked })}
                disabled={!settings?.emailNotificationsEnabled}
                data-testid="switch-notify-task-due"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Status Changes</Label>
                <p className="text-sm text-gray-500">When intake record status is updated</p>
              </div>
              <Switch
                checked={settings?.notifyOnStatusChange}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ notifyOnStatusChange: checked })}
                disabled={!settings?.emailNotificationsEnabled}
                data-testid="switch-notify-status-change"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
