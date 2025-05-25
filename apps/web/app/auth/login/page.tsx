import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-background">
      <LoginForm />
    </div>
  );
}
