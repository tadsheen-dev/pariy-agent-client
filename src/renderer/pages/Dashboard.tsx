import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workTimer, setWorkTimer] = useState(0);
  const [callTimer, setCallTimer] = useState(0);
  const [isInCall, setIsInCall] = useState(false);
  const [agentInfo, setAgentInfo] = useState({
    name: 'Ahmed Hassan',
    status: 'online',
    shift: '9:00 AM - 5:00 PM'
  });
  const [aiTips, setAiTips] = useState('');
  const [selectedProcess, setSelectedProcess] = useState('ms-teams.exe');
  const [isAudioSessionActive, setIsAudioSessionActive] = useState(false);

  const processes = [
    { value: 'ms-teams.exe', label: 'Microsoft Teams' },
    { value: 'zoom.exe', label: 'Zoom' },
    // Add more processes as needed
  ];

  // Work timer
  useEffect(() => {
    const timer = setInterval(() => {
      setWorkTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Call timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInCall) {
      timer = setInterval(() => {
        setCallTimer(prev => prev + 1);
        // Simulate AI tips
        if (callTimer % 10 === 0) { // Every 10 seconds
          setAiTips('Tip: Remember to maintain a positive tone');
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isInCall, callTimer]);

  useEffect(() => {
    // Listen for audio session updates from main process
    window.electron.ipcRenderer.on('audio-session-update', (active: boolean) => {
      setIsAudioSessionActive(active);
    });

    // Start monitoring when process is selected
    if (selectedProcess) {
      window.electron.ipcRenderer.sendMessage('start-monitoring', selectedProcess);
    }

    return () => {
      window.electron.ipcRenderer.sendMessage('stop-monitoring');
    };
  }, [selectedProcess]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCallSimulation = () => {
    setIsInCall(true);
    setCallTimer(0);
  };

  const endCall = () => {
    setIsInCall(false);
    setCallTimer(0);
    setAiTips('');
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen relative">
      {/* Process Selector */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <div className="flex items-center justify-between">
          <select 
            value={selectedProcess}
            onChange={(e) => setSelectedProcess(e.target.value)}
            className="form-select block w-64 rounded-md border-gray-300 shadow-sm"
          >
            {processes.map(process => (
              <option key={process.value} value={process.value}>
                {process.label}
              </option>
            ))}
          </select>
          
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${isAudioSessionActive ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              {isAudioSessionActive ? 'Audio Session Active' : 'No Audio Session'}
            </span>
          </div>
        </div>
      </div>

      {/* Agent Info & Timer */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{agentInfo.name}</h2>
            <p className="text-gray-600">Shift: {agentInfo.shift}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Time at work</p>
            <p className="text-2xl font-mono font-bold text-purple-600">{formatTime(workTimer)}</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Today's Calls</h3>
          <p className="text-4xl font-bold text-gray-900">15</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Average Duration</h3>
          <p className="text-4xl font-bold text-gray-900">4:30</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Satisfaction Score</h3>
          <p className="text-4xl font-bold text-gray-900">8.5/10</p>
        </div>
      </div>

      {/* Call Control */}
      {!isInCall ? (
        <button
          onClick={handleCallSimulation}
          className="bg-green-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-600 transition-colors"
        >
          Simulate Incoming Call
        </button>
      ) : (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500">Current Call Duration</p>
              <p className="text-4xl font-mono font-bold text-purple-600">{formatTime(callTimer)}</p>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-purple-800 mb-2">AI Assistant Tips</h3>
              <p className="text-purple-600">{aiTips || 'Listening to the conversation...'}</p>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-2">Customer Context</h3>
                <p className="text-gray-600">Active conversation - analyzing sentiment and context...</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-2">Suggested Responses</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>"I understand your concern..."</li>
                  <li>"Let me help you resolve this..."</li>
                  <li>"Would you like me to explain further?"</li>
                </ul>
              </div>
            </div>

            <button
              onClick={endCall}
              className="mt-6 w-full bg-red-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-600 transition-colors"
            >
              End Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 