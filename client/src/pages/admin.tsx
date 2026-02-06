import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Users, Shield, UserCheck, UserPlus, Link2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@shared/models/auth";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newRole, setNewRole] = useState("volunteer");

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to approve user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success("User approved successfully");
    },
    onError: () => {
      toast.error("Failed to approve user");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/reject`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reject user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success("User rejected");
    },
    onError: () => {
      toast.error("Failed to reject user");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success("Role updated successfully");
    },
    onError: () => {
      toast.error("Failed to update role");
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; role: string }) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const msg = data.platformLinked
        ? `User created and linked to platform (${data.platformUserId})`
        : "User created (no platform account found — you can link manually)";
      toast.success(msg);
      setShowCreateForm(false);
      setNewEmail("");
      setNewFirstName("");
      setNewLastName("");
      setNewRole("volunteer");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const linkPlatformMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/link-platform`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to link platform");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success(`Platform linked: ${data.platformUserId}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const unlinkPlatformMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/platform-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platformUserId: null }),
      });
      if (!res.ok) throw new Error("Failed to unlink");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success("Platform account unlinked");
    },
  });

  const pendingUsers = users.filter(u => u.approvalStatus === 'pending');
  const approvedUsers = users.filter(u => u.approvalStatus === 'approved');
  const rejectedUsers = users.filter(u => u.approvalStatus === 'rejected');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-purple-100 text-purple-800">Admin</Badge>;
      case 'volunteer':
        return <Badge className="bg-blue-100 text-blue-800">Volunteer</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Pending</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-[#236383] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-[#236383]" />
        <div>
          <h1 className="text-2xl font-bold text-[#236383]">User Management</h1>
          <p className="text-gray-600">Approve new users and manage roles</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingUsers.length}</p>
                <p className="text-sm text-gray-600">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <UserCheck className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedUsers.length}</p>
                <p className="text-sm text-gray-600">Active Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rejectedUsers.length}</p>
                <p className="text-sm text-gray-600">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create User */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Create User Account
              </CardTitle>
              <CardDescription>Add a new user — they'll be pre-approved and auto-linked to the main platform</CardDescription>
            </div>
            {!showCreateForm && (
              <Button onClick={() => setShowCreateForm(true)} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            )}
          </div>
        </CardHeader>
        {showCreateForm && (
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    placeholder="user@example.com"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="volunteer">Volunteer</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    placeholder="First name"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    placeholder="Last name"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500">
                The user will be created as pre-approved. Their email will be used to auto-link their main platform account.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => createUserMutation.mutate({
                    email: newEmail,
                    firstName: newFirstName,
                    lastName: newLastName,
                    role: newRole,
                  })}
                  disabled={!newEmail.trim() || createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  Create User
                </Button>
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {pendingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-[#a31c41]">Pending Approval</CardTitle>
            <CardDescription>New users waiting for approval</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200"
                  data-testid={`user-pending-${user.id}`}
                >
                  <div className="flex items-center gap-3">
                    {user.profileImageUrl ? (
                      <img 
                        src={user.profileImageUrl} 
                        alt={user.firstName || ''} 
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#236383] flex items-center justify-center text-white font-semibold">
                        {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{user.firstName} {user.lastName}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select 
                      defaultValue="volunteer"
                      onValueChange={(role) => approveMutation.mutate({ userId: user.id, role })}
                    >
                      <SelectTrigger className="w-32" data-testid={`select-role-${user.id}`}>
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="volunteer">Volunteer</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approveMutation.mutate({ userId: user.id, role: 'volunteer' })}
                      data-testid={`button-approve-${user.id}`}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => rejectMutation.mutate(user.id)}
                      data-testid={`button-reject-${user.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Users</CardTitle>
          <CardDescription>Manage user roles and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="p-4 bg-gray-50 rounded-lg space-y-3"
                data-testid={`user-row-${user.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {user.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt={user.firstName || ''}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#236383] flex items-center justify-center text-white font-semibold">
                        {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{user.firstName} {user.lastName}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(user.approvalStatus)}
                    {user.approvalStatus === 'approved' && (
                      <Select
                        value={user.role}
                        onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role })}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-update-role-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="volunteer">Volunteer</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {user.approvalStatus !== 'approved' && getRoleBadge(user.role)}
                  </div>
                </div>
                {/* Platform link status */}
                {user.approvalStatus === 'approved' && (
                  <div className="flex items-center gap-2 ml-13 pl-[52px]">
                    {user.platformUserId ? (
                      <>
                        <ExternalLink className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-700 font-mono">{user.platformUserId}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-gray-500"
                          onClick={() => unlinkPlatformMutation.mutate(user.id)}
                        >
                          Unlink
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-amber-600">No platform link</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-[#236383]"
                          onClick={() => linkPlatformMutation.mutate(user.id)}
                          disabled={linkPlatformMutation.isPending}
                        >
                          {linkPlatformMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Link2 className="h-3 w-3 mr-1" />
                          )}
                          Auto-Link
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
