import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('agent_token');
    navigate('/login');
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Settings</h1>
      <button
        onClick={handleLogout}
        className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
      >
        Logout
      </button>
    </div>
  );
} 