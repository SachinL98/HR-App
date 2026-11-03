import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-ui bg-primary text-lg font-bold text-primary-fg">H</div>
        <p className="text-sm text-muted">HR App</p>
      </div>
      <div className="rounded-ui border border-line bg-surface p-6">{children}</div>
    </main>
  );
}
