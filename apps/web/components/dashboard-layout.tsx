"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Brain,
  FileText,
  Home,
  Kanban,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User;
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const pathname = usePathname();
  
  const getInitials = (email?: string, fullName?: string) => {
    if (fullName) {
      return fullName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (!email) return "U";
    return email
      .split("@")[0]
      .split(".")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserDisplayName = () => {
    return user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  };

  const navigationSections = [
    {
      label: "Overview",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: Home,
        },
        {
          title: "Board View",
          url: "/dashboard/board",
          icon: Kanban,
        },
      ],
    },
    {
      label: "Applications",
      items: [
        {
          title: "Add Application",
          url: "/dashboard/add-application",
          icon: Plus,
        },
        {
          title: "My Resumes",
          url: "/dashboard/resumes",
          icon: FileText,
        },
      ],
    },
    {
      label: "AI Tools",
      items: [
        {
          title: "Job Discovery",
          url: "/dashboard/job-discovery",
          icon: Search,
        },
        {
          title: "Interview Prep",
          url: "/dashboard/interview-prep",
          icon: MessageSquare,
        },
        {
          title: "Matches",
          url: "/dashboard/matches",
          icon: Brain,
        },
      ],
    },
  ];

  return (
    <SidebarProvider>
      <div className="bg-sidebar flex h-screen w-full">
        <Sidebar noBorder className="bg-sidebar">
          <SidebarHeader className="px-6 py-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 transition-opacity hover:opacity-80"
            >
              <div className="bg-primary flex h-6 w-6 items-center justify-center rounded">
                <span className="text-primary-foreground text-xs font-medium">
                  C
                </span>
              </div>
              <span className="text-foreground text-sm font-medium">
                CareerCopilot
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="flex-1 px-4">
            <SidebarMenu className="space-y-1">
              {navigationSections.flatMap((section) =>
                section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="h-9">
                      <Link
                        href={item.url}
                        className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 px-3 py-2 text-sm transition-colors rounded-lg ${
                          pathname === item.url
                            ? "text-black bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,1)] border border-gray-200/80 bg-gradient-to-b from-white to-gray-100/60 dark:text-white dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] dark:border-white/10 dark:bg-gradient-to-b dark:from-white/10 dark:to-white/5 dark:bg-accent"
                            : "text-sidebar-foreground"
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )),
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="px-4 py-4">
            <Link
              href="/settings"
              className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-sidebar-foreground"
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-muted text-foreground text-xs font-medium">
                  {getInitials(user.email, user.user_metadata?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">
                  {getUserDisplayName()}
                </span>
              </div>
            </Link>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="border-border bg-background mt-4 mb-4 ml-4 flex min-w-0 flex-1 flex-col rounded-l-[2rem] border-t border-b border-l shadow-xl">
          {/* Header */}
          <header className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center justify-between rounded-tl-[2rem] border-b px-6 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground -ml-1" />
            </div>
            <ThemeToggle />
          </header>

          {/* Main Content */}
          <main className="bg-background flex-1 overflow-auto rounded-bl-[2rem]">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
