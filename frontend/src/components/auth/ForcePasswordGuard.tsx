"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function ForcePasswordGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user?.must_change_password) {
      router.replace("/change-password");
    }
  }, [isLoading, user, router]);

  // Block rendering until we know whether a redirect is needed
  if (!isLoading && user?.must_change_password) return null;

  return <>{children}</>;
}
