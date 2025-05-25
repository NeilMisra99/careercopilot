import { VerifyOtpForm } from "@/components/auth/verify-otp-form";
import { Suspense } from "react";

interface VerifyOtpPageProps {
  searchParams: Promise<{
    email?: string;
  }>;
}

// Separate component to handle searchParams access and suspense boundary
async function VerifyOtpContent(props: VerifyOtpPageProps) {
  const params = await props.searchParams;
  const email = params.email;
  if (!email) {
    return (
      <div className="w-full max-w-md p-8 text-center">
        <p className="text-destructive">
          Email not provided for OTP verification. Please try the sign-up
          process again.
        </p>
      </div>
    );
  }
  return <VerifyOtpForm email={email} />;
}

export default function VerifyOtpPage({ searchParams }: VerifyOtpPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 text-center">Loading...</div>
        }
      >
        <VerifyOtpContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
