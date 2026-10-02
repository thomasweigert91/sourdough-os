import { AppHeader } from "@/components/app/app-header";
import { OfflineSync } from "@/components/app/offline-sync";
import { QueryProvider } from "@/components/app/query-provider";
import { CalculatorScreen } from "@/components/calculator/calculator-screen";
import { CALCULATOR_TITLE } from "@/lib/calculator/messages";

/** /calculator ist ohne Anmeldung erreichbar (Gastmodus), daher kein Session-Gate. */
export default function CalculatorRoute() {
  return (
    <QueryProvider>
      <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
        <OfflineSync />
        <AppHeader />
        <main className="flex-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {CALCULATOR_TITLE}
            </h1>
            <CalculatorScreen />
          </div>
        </main>
      </div>
    </QueryProvider>
  );
}
