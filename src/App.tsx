import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PlanRoute from './routes/PlanRoute';

const NAV = [
  { to: '/plan', label: 'Plan' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/shortfalls', label: 'Shortfalls' },
  { to: '/scenarios', label: 'Scenarios' },
];

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">Coming in a later phase.</p>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Next Chapter</h1>
          <nav className="mt-3 flex flex-wrap gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-accent-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/plan" element={<PlanRoute />} />
          <Route path="/timeline" element={<Placeholder title="Timeline" />} />
          <Route path="/shortfalls" element={<Placeholder title="Shortfalls" />} />
          <Route path="/scenarios" element={<Placeholder title="Scenarios" />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
    </div>
  );
}
