"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  Brain,
  Briefcase,
  Calendar,
  FileText,
  Home,
  Kanban,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Upload,
} from "lucide-react";
import Link from "next/link";
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

  const navigationItems = [
    {
      title: "Overview",
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
      title: "Applications",
      items: [
        {
          title: "Add Application",
          url: "/dashboard/add-application",
          icon: Plus,
        },
        {
          title: "All Applications",
          url: "/dashboard/applications",
          icon: Briefcase,
        },
      ],
    },
    {
      title: "Resume Management",
      items: [
        {
          title: "My Resumes",
          url: "/dashboard/resumes",
          icon: FileText,
        },
        {
          title: "Upload Resume",
          url: "/dashboard/resumes?upload=true",
          icon: Upload,
        },
      ],
    },
    {
      title: "AI Analysis",
      items: [
        {
          title: "Job Discovery",
          url: "/dashboard/job-discovery",
          icon: Search,
        },
        {
          title: "Job-Resume Matches",
          url: "/dashboard/matches",
          icon: Brain,
        },
        {
          title: "Interview Prep",
          url: "/dashboard/interview-prep",
          icon: MessageSquare,
        },
      ],
    },
    {
      title: "Analytics",
      items: [
        {
          title: "Reports",
          url: "/dashboard/reports",
          icon: BarChart3,
        },
        {
          title: "Documents",
          url: "/dashboard/documents",
          icon: FileText,
        },
        {
          title: "Calendar",
          url: "/dashboard/calendar",
          icon: Calendar,
        },
      ],
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900">
        <Sidebar noBorder>
          <SidebarHeader className="border-border/40 mt-1 border-b px-6 pt-5.5 pb-2.5">
            <Link
              href="/dashboard"
              className="flex items-center space-x-3 transition-opacity hover:opacity-80"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 shadow-sm dark:from-slate-100 dark:via-slate-200 dark:to-slate-300">
                <span className="text-sm font-bold text-white dark:text-slate-900">
                  T
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-lg font-semibold tracking-tight">
                  CareerCopilot
                </span>
                <span className="text-muted-foreground text-xs">
                  Job Application Tracker
                </span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="flex-1 px-3 py-4">
            {navigationItems.map((group) => (
              <SidebarGroup key={group.title} className="mb-4">
                <SidebarGroupLabel className="text-muted-foreground/70 px-3 text-xs font-semibold tracking-wider uppercase">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild className="h-9 px-3">
                          <Link
                            href={item.url}
                            className="hover:bg-accent/50 flex items-center space-x-3 rounded-lg transition-all duration-200"
                          >
                            <item.icon className="text-muted-foreground h-4 w-4" />
                            <span className="text-foreground text-sm font-medium">
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {/* Quick Search */}
            <SidebarGroup className="mt-8">
              <SidebarGroupLabel className="text-muted-foreground/70 px-3 text-xs font-semibold tracking-wider uppercase">
                Quick Actions
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="h-9 px-3">
                      <button className="hover:bg-accent/50 flex w-full items-center space-x-3 rounded-lg transition-all duration-200">
                        <Search className="text-muted-foreground h-4 w-4" />
                        <span className="text-foreground text-sm font-medium">
                          Search Applications
                        </span>
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-border/40 mt-auto border-t p-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-12 px-3">
                  <Link
                    href="/settings"
                    className="hover:bg-accent/50 flex items-center space-x-3 rounded-lg transition-all duration-200"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 text-xs font-semibold text-slate-700 dark:from-slate-700 dark:via-slate-600 dark:to-slate-500 dark:text-slate-200">
                        {getInitials(user.email, user.user_metadata?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-foreground truncate text-sm font-medium">
                        {getUserDisplayName()}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {user.email}
                      </span>
                    </div>
                    <Settings className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="mt-4 mb-4 ml-4 flex min-w-0 flex-1 flex-col rounded-l-[2rem] border-t border-b border-l border-slate-200/50 bg-gradient-to-br from-white to-white dark:border-slate-700/60 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between rounded-tl-[2rem] border-b border-slate-200/60 px-6 backdrop-blur-sm dark:border-slate-700/50">
            <div className="flex items-center space-x-4">
              <SidebarTrigger className="-ml-1" />
            </div>
            <ThemeToggle />
          </header>

          {/* Main Content */}
          <main className="h-[calc(100vh-6rem)] flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
