/* eslint-disable prettier/prettier */
/* Removed unnecessary eslint-disable directive */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Types for IPC
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        once(arg0: string, arg1: (response: any) => void): unknown;
        sendMessage(channel: string, ...args: unknown[]): void;
        on(
          channel: string,
          func: (...args: unknown[]) => void,
        ): (() => void) | undefined;
      };
    };
  }
}

interface Agent {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  status: string;
  platform: {
    name: string;
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [workTimer, setWorkTimer] = useState(0);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isAudioSessionActive, setIsAudioSessionActive] = useState(false);

  // Load agent data from localStorage
  useEffect(() => {
    const agentData = localStorage.getItem('agent_data');
    if (!agentData) {
      navigate('/login');
      return;
    }
    setAgent(JSON.parse(agentData));
  }, [navigate]);

  // Listen for audio session updates
  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on(
      'audio-session-update',
      (...args: unknown[]) => {
        const [active] = args;
        setIsAudioSessionActive(Boolean(active));
      },
    );

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Work timer
  useEffect(() => {
    const loginTime = localStorage.getItem('login_time');
    if (loginTime) {
      const startTime = parseInt(loginTime, 10);
      setWorkTimer(Math.floor((Date.now() - startTime) / 1000));
      const intervalId = setInterval(() => {
        setWorkTimer(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(intervalId);
    }
    return () => { };
  }, []);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!agent) {
    return null;
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen relative">
      {/* Platform & Audio Session Status */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-gray-700 font-medium mr-2">Platform:</span>
            <span className="text-gray-900">{agent.platform.name}</span>
          </div>
          <div className="flex items-center">
            <div
              className={`
                w-3 h-3 rounded-full mr-2 
                ${isAudioSessionActive ? 'bg-green-500' : 'bg-red-500'}
              `}
            />
            <span className="text-sm text-gray-600">
              {isAudioSessionActive ? 'Call Session Active' : 'No Call Session'}
            </span>
          </div>
        </div>
      </div>

      {/* Agent Info & Timer */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {agent.full_name}
            </h2>
            <p className="text-gray-600">Status: {agent.status}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Time at work</p>
            <p className="text-2xl font-mono font-bold text-purple-600">
              {formatTime(workTimer)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-gray-500 mb-2">Today&apos;s Calls</h3>
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
    </div>
  );
}
