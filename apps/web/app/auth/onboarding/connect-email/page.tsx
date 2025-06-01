import { Suspense } from "react";
import { ConnectEmailClient } from "./_components/connect-email-client";

export default function ConnectEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          Loading...
        </div>
      }
    >
      <ConnectEmailClient />
    </Suspense>
  );
}
