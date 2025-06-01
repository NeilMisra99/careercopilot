"use client";

import React, { useState } from "react";
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
} from "@/components/ui/animated-sidebar";
import { Home, Kanban, Settings } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";

interface User {
  id: string;
  email?: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User;
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);

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

  const links = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <Home className="text-muted-foreground h-6 w-6 flex-shrink-0" />,
    },
    {
      label: "Board View",
      href: "/dashboard/board",
      icon: <Kanban className="text-muted-foreground h-6 w-6 flex-shrink-0" />,
    },
    {
      label: "Settings",
      href: "/settings",
      icon: (
        <Settings className="text-muted-foreground h-6 w-6 flex-shrink-0" />
      ),
    },
  ];

  return (
    <div className="h-screen grid grid-cols-[auto_1fr] bg-background">
      {/* Sidebar */}
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="flex flex-col h-full">
          {/* Logo and Navigation */}
          <div className="flex flex-col">
            {open ? <Logo /> : <LogoIcon />}
            <div className="mt-8 flex flex-col pl-1 gap-2">
              {links.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>

          {/* Spacer to push avatar to bottom */}
          <div className="flex-1"></div>

          {/* User Avatar Footer */}
          <div className="border-t border-border pt-4">
            <SidebarLink
              link={{
                label: user.email?.split("@")[0] || "User",
                href: "/settings",
                icon: (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white font-medium">
                      {getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
                ),
              }}
            />
          </div>
        </SidebarBody>
      </Sidebar>

      {/* Main Content Area */}
      <div className="min-w-0 flex flex-col h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-end">
          <ThemeToggle />
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

export const Logo = () => {
  return (
    <Link
      href="/dashboard"
      className="font-normal flex space-x-3 items-center text-sm py-1 relative z-20"
    >
      <div className="w-8 h-8 mt-1 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold text-sm">T</span>
      </div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-medium mt-1 text-foreground whitespace-pre"
      >
        TrackFlow
      </motion.span>
    </Link>
  );
};

export const LogoIcon = () => {
  return (
    <Link
      href="/dashboard"
      className="font-normal flex space-x-3 items-center text-sm py-1 relative z-20"
    >
      <div className="w-8 h-8 mt-1 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold text-sm">T</span>
      </div>
    </Link>
  );
};
