"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Home, Kanban } from "lucide-react";

interface User {
  id: string;
  email?: string;
}

interface AppSidebarProps {
  user: User;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const getInitials = (email?: string) => {
    if (!email) return "U";
    return email
      .split("@")[0]
      .split(".")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
            <span className="text-sm font-bold text-white">T</span>
          </div>
          <h2 className="text-lg font-semibold">CareerCopilot</h2>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-grow">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/dashboard/board">
                <Kanban className="mr-2 h-4 w-4" />
                <span>Board View</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-2 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-12 w-full px-3 py-2">
              <a href="/settings">
                <div className="flex w-full items-center gap-2">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-medium text-white">
                      {getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col text-left">
                    <span className="truncate text-sm leading-none font-medium">
                      {user.email?.split("@")[0] || "User"}
                    </span>
                    <span className="text-muted-foreground mt-1 truncate text-[11px]">
                      {user.email}
                    </span>
                  </div>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
