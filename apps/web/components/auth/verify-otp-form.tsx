"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import Link from "next/link";

const otpFormSchema = z.object({
  token: z
    .string()
    .min(6, { message: "OTP must be 6 characters." })
    .max(6, { message: "OTP must be 6 characters." }),
});
type OtpFormValues = z.infer<typeof otpFormSchema>;

interface VerifyOtpFormProps {
  email: string;
}

export function VerifyOtpForm({ email }: VerifyOtpFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const form = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: {
      token: "",
    },
  });

  const onSubmit = async (values: OtpFormValues) => {
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email,
        token: values.token,
        type: "signup",
      });

      if (error) {
        throw error;
      }

      toast.success("Email verified successfully! Proceeding to next step...");
      router.push("/auth/onboarding/connect-email");
      router.refresh(); // Important to update server-side session state for layout
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Invalid OTP or other error.";
      toast.error("Verification Failed", { description: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    setIsSubmitting(true);
    toast.info("Resending OTP...");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email,
    });
    setIsSubmitting(false);

    if (error) {
      toast.error("Failed to resend OTP", { description: error.message });
    } else {
      toast.success("New OTP sent! Check your email.");
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center text-card-foreground">
        Verify your email
      </h2>
      <p className="text-sm text-center text-muted-foreground">
        An OTP has been sent to <strong>{email}</strong>. Please enter it below.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="token"
            render={({ field }) => (
              <FormItem className="flex flex-col items-center">
                <FormLabel>One-Time Password</FormLabel>
                <FormControl>
                  <InputOTP maxLength={6} {...field} disabled={isSubmitting}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormDescription>
                  Please enter the 6-digit code sent to your email.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !form.formState.isValid}
          >
            {isSubmitting ? "Verifying..." : "Verify OTP & Sign In"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleResendOtp}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Sending..." : "Resend Code"}
          </Button>
        </form>
      </Form>
      <p className="text-sm text-center text-muted-foreground">
        Entered wrong email during sign up?{" "}
        <Link
          href="/auth/signup"
          className="font-medium text-primary hover:underline"
        >
          Go back to Sign Up
        </Link>
      </p>
    </div>
  );
}
