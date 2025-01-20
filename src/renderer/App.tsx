import { MemoryRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import './App.css';
import { useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyCalls from './pages/MyCalls';
import Settings from './pages/Settings';
import Performance from './pages/Performance';


// Layout components
function Layout({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-6 bg-gray-100 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="w-64 h-full bg-white shadow-md">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-gray-800">Call Center Agent</h2>
      </div>
      <nav className="mt-4">
        <ul className="space-y-2">
          <li>
            <Link to="/" className="block py-2 px-4 text-gray-700 hover:bg-gray-100 rounded transition">
              Dashboard
            </Link>
          </li>
          <li>
            <Link to="/calls" className="block py-2 px-4 text-gray-700 hover:bg-gray-100 rounded transition">
              My Calls
            </Link>
          </li>
          <li>
            <Link to="/performance" className="block py-2 px-4 text-gray-700 hover:bg-gray-100 rounded transition">
              Performance
            </Link>
          </li>
          <li>
            <Link to="/settings" className="block py-2 px-4 text-gray-700 hover:bg-gray-100 rounded transition">
              Settings
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function PrivateRoute({ children }) {
  const [isAuthenticated] = useState(localStorage.getItem('agent_token')); // Mock auth check
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/calls" element={<MyCalls />} />
                  <Route path="/performance" element={<Performance />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}
