"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Signed out successfully");
        router.push("/");
      } else {
        toast.error("Failed to sign out", {
          description: data.message,
        });
      }
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("Network error", {
        description: "Failed to sign out. Please try again.",
      });
    }
  };

  return (
    <div className="h-full bg-stone-50 dark:bg-stone-900">
      <div className="container mx-auto px-6 py-8 max-w-7xl h-full">
        {/* Header with Sign Out Button */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Settings className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Settings
              </h1>
              <p className="text-stone-600 dark:text-stone-400 mt-1">
                Manage your account and preferences
              </p>
            </div>
          </div>
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>

        {/* Settings Content */}
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Account management features coming soon...
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Integration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Email sync and integration settings coming soon...
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Notification preferences coming soon...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
