import { RefreshCw } from "lucide-react";

export default function WorkspaceLoading() {
  return (
    <main className="route-page-loading" aria-live="polite" aria-busy="true">
      <RefreshCw className="spin" />
      <span>Opening workspace…</span>
    </main>
  );
}
