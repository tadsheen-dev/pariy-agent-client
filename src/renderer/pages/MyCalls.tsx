import { useState, useEffect } from 'react';

interface Call {
  id: number;
  customer: string;
  duration: string;
  date: string;
}

const MOCK_CALLS_DATA: Call[] = [
  {
    id: 1,
    customer: 'John Doe',
    duration: '3:45',
    date: '2023-10-01',
  },
  {
    id: 2,
    customer: 'Jane Smith',
    duration: '2:30',
    date: '2023-10-02',
  },
];

export default function MyCalls() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calls, setCalls] = useState<Call[]>([]);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        setCalls(MOCK_CALLS_DATA);
      } catch (err) {
        setError('Failed to load calls');
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">My Calls</h1>
      <ul className="space-y-4">
        {calls.map((call) => (
          <li key={call.id} className="bg-white p-4 rounded-lg shadow-md">
            <p className="text-lg font-medium text-gray-900">{call.customer}</p>
            <p className="text-gray-600">Duration: {call.duration}</p>
            <p className="text-gray-600">Date: {call.date}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
