import { Dashboard } from "@/components/auth/dashboard";
import { SessionGate } from "@/components/auth/session-gate";

export default function DashboardPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 py-16 dark:bg-black">
      <div className="w-full max-w-sm px-4">
        <SessionGate require="user">
          <Dashboard />
        </SessionGate>
      </div>
    </main>
  );
}
