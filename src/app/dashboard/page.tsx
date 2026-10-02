import { AppHeader } from "@/components/app/app-header";
import { CachedSessionGate } from "@/components/app/cached-session-gate";
import { OfflineSync } from "@/components/app/offline-sync";
import { QueryProvider } from "@/components/app/query-provider";
import { TemperatureUnitSetting } from "@/components/app/temperature-unit-setting";
import { Dashboard } from "@/components/auth/dashboard";

export default function DashboardPage() {
  return (
    <QueryProvider>
      <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
        <CachedSessionGate>
          <OfflineSync />
          <AppHeader />
          <main className="flex flex-1 items-center justify-center py-16">
            <div className="w-full max-w-sm px-4">
              <Dashboard>
                <TemperatureUnitSetting />
              </Dashboard>
            </div>
          </main>
        </CachedSessionGate>
      </div>
    </QueryProvider>
  );
}
