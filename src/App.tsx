import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PlanRoute from './routes/PlanRoute';
import TimelineRoute from './routes/TimelineRoute';
import ShortfallsRoute from './routes/ShortfallsRoute';
import ScenariosRoute from './routes/ScenariosRoute';
import GoalsRoute from './routes/GoalsRoute';

const NAV = [
  { to: '/plan', label: 'Plan' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/shortfalls', label: 'Shortfalls' },
  { to: '/goals', label: 'Goals' },
  { to: '/scenarios', label: 'Scenarios' },
];

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
          <Route path="/timeline" element={<TimelineRoute />} />
          <Route path="/shortfalls" element={<ShortfallsRoute />} />
          <Route path="/goals" element={<GoalsRoute />} />
          <Route path="/scenarios" element={<ScenariosRoute />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
    </div>
  );
}
