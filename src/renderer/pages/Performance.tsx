import { useState, useEffect } from 'react';

interface PerformanceData {
  callsHandled: number;
  avgSatisfaction: number;
  avgDuration: string;
}

export default function Performance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [performance, setPerformance] = useState<PerformanceData>({
    callsHandled: 0,
    avgSatisfaction: 0,
    avgDuration: '0:00',
  });

  useEffect(() => {
    const fetchPerformance = async () => {
      try {
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });

        setPerformance({
          callsHandled: 50,
          avgSatisfaction: 8.2,
          avgDuration: '4:15',
        });
      } catch (err) {
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };

    fetchPerformance();
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
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Performance</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Calls Handled</h3>
          <p className="text-4xl font-bold text-gray-900">
            {performance.callsHandled}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Average Satisfaction</h3>
          <p className="text-4xl font-bold text-gray-900">
            {performance.avgSatisfaction}/10
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Average Duration</h3>
          <p className="text-4xl font-bold text-gray-900">
            {performance.avgDuration}
          </p>
        </div>
      </div>
    </div>
  );
}
