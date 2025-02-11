/* eslint-disable prettier/prettier */
import {
  MemoryRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from 'react-router-dom';
import './App.css';
import { useState, ReactNode } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyCalls from './pages/MyCalls';
import Settings from './pages/Settings';
import Performance from './pages/Performance';
import RecordingPopup from './components/RecordingPopup';

// Types
interface LayoutProps {
  children: ReactNode;
}

interface PrivateRouteProps {
  children: ReactNode;
}

// Sidebar component (defined before use)
function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('agent_token');
    navigate('/login');
  };

  return (
    <div className="h-screen w-64 bg-white border-r border-gray-200 fixed left-0 top-0 z-50">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800">Call Center Agent</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <Link
                to="/"
                className="flex items-center px-4 py-2 text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                to="/calls"
                className="flex items-center px-4 py-2 text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                My Calls
              </Link>
            </li>
            <li>
              <Link
                to="/performance"
                className="flex items-center px-4 py-2 text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Performance
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                className="flex items-center px-4 py-2 text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
            </li>
          </ul>
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

// Layout component
function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-6 bg-gray-100 overflow-auto">{children}</main>
    </div>
  );
}

function PrivateRoute({ children }: PrivateRouteProps) {
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
              <>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/calls" element={<MyCalls />} />
                    <Route path="/performance" element={<Performance />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Layout>
                <RecordingPopup />
              </>
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}
