import { RegisterForm } from "@/components/auth/register-form";
import { SessionGate } from "@/components/auth/session-gate";

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 py-16 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-8 px-4">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Registrieren
        </h1>
        <SessionGate require="guest">
          <RegisterForm />
        </SessionGate>
      </div>
    </main>
  );
}
