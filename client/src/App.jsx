const appName = import.meta.env.VITE_APP_NAME || 'ResolveHQ';

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <section className="max-w-xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">
          Project foundation
        </p>
        <h1 className="text-4xl font-bold tracking-tight">{appName}</h1>
        <p className="mt-4 text-lg text-slate-600">
          The client foundation is ready for the first product phase.
        </p>
      </section>
    </main>
  );
}
