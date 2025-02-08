/* eslint-disable prettier/prettier */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Types for IPC and Media APIs
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        sendMessage(channel: string, ...args: unknown[]): void;
        on(
          channel: string,
          func: (...args: unknown[]) => void,
        ): (() => void) | undefined;
      };
    };
  }

  interface BlobEvent extends Event {
    readonly data: Blob;
    readonly timecode: number;
  }

  interface MediaRecorderEventMap {
    dataavailable: BlobEvent;
    error: ErrorEvent;
    pause: Event;
    resume: Event;
    start: Event;
    stop: Event;
  }

  interface MediaRecorderOptions {
    mimeType?: string;
    audioBitsPerSecond?: number;
    videoBitsPerSecond?: number;
    bitsPerSecond?: number;
  }

  interface MediaStreamTrack {
    stop(): void;
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

// Add type definitions for electron's desktop capture
interface ElectronDesktopCaptureConstraints {
  audio: {
    mandatory: {
      chromeMediaSource: 'desktop';
      chromeMediaSourceId: string;
    };
    optional?: Array<{ echoCancellation: boolean }>;
  };
  video: false;
}

// Update API endpoint constant
const ANALYSIS_API_ENDPOINT = 'http://localhost:3001/api/audio-analysis';

// Add NodeJS type import
/// <reference types="node" />

export default function Dashboard() {
  const isMountedRef = useRef(true);
  const cleanupCalledRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    cleanupCalledRef.current = false;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const navigate = useNavigate();
  const [workTimer, setWorkTimer] = useState(0);
  const [callTimer, setCallTimer] = useState(0);
  const [isInCall, setIsInCall] = useState(false);
  const [isAudioSessionActive, setIsAudioSessionActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Load agent data from localStorage
  useEffect(() => {
    const agentData = localStorage.getItem('agent_data');
    if (!agentData) {
      navigate('/login');
      return;
    }
    setAgent(JSON.parse(agentData));
  }, [navigate]);

  // Get process name based on platform
  const getProcessName = (platformName: string): string => {
    switch (platformName.toLowerCase()) {
      case 'teams':
        return 'ms-teams.exe';
      case 'zoom':
        // Mencoba berbagai kemungkinan nama proses Zoom
        return 'Zoom.exe';
      default:
        return '';
    }
  };

  // Moved endCall function definition (moved up to be defined before its usage):
  const endCall = () => {
    console.log('Ending call manually');

    // First stop recording if active
    if (mediaRecorderRef.current?.state === 'recording') {
      console.log('Stopping recording on manual end call');
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => {
          track.stop();
        });
        mediaRecorderRef.current = null;
      } catch (error) {
        console.error('Error stopping recording on end call:', error);
      }
    }

    // Notify main process to handle audio session
    window.electron.ipcRenderer.sendMessage('end-call');

    // Only update state if component is still mounted
    if (isMountedRef.current) {
      setIsInCall(false);
      setCallTimer(0);
      setIsRecording(false);
      setIsAudioSessionActive(false);
    }
  };

  // Helper function to handle recording stop wrapped in useCallback
  const handleRecordingStop = useCallback(async (
    recordingChunks: Blob[],
    recordingMimeType: string,
    recordingDuration: number
  ) => {
    console.log('MediaRecorder stopped');
    try {
      console.log('Processing chunks...');
      if (recordingChunks.length === 0) {
        throw new Error('No audio data recorded');
      }

      // Create WebM with proper duration metadata
      const finalBlob = new Blob(recordingChunks, { type: recordingMimeType });
      const arrayBuffer = await finalBlob.arrayBuffer();

      // Add WebM duration metadata
      const view = new DataView(arrayBuffer);
      const durationScale = 1000000000; // nanoseconds
      const durationPos = arrayBuffer.byteLength - 8; // Duration is typically stored near the end
      view.setFloat64(durationPos, recordingDuration * durationScale);

      console.log('Final recording duration:', recordingDuration, 'seconds');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `recording-${timestamp}-${Math.round(recordingDuration)}s.webm`;

      // Create form data with accurate duration
      const formData = new FormData();
      formData.append(
        'audio',
        new File([arrayBuffer], fileName, {
          type: recordingMimeType,
          lastModified: Date.now()
        })
      );

      const recordingStartDate = new Date(Date.now() - (recordingDuration * 1000));
      const recordingEndDate = new Date();

      const metadata = {
        agentId: agent?.id,
        platform: agent?.platform.name,
        duration: Math.round(recordingDuration),
        timestamp: recordingStartDate.toISOString(),
        endTime: recordingEndDate.toISOString(),
      };

      formData.append('metadata', JSON.stringify(metadata));

      // Send to analysis API
      try {
        console.log('Sending recording for analysis...');
        const response = await fetch(ANALYSIS_API_ENDPOINT, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Analysis failed: ${response.statusText}`);
        }

        const analysisResponse = await response.json();
        console.log('Analysis received:', analysisResponse);

        if (analysisResponse.object) {
          const analysisObj = analysisResponse.object;
          // Construct transcript from segments
          const transcript = analysisObj.segments
            .map((seg: any) => seg.transcript_english)
            .join('\n');
          // Log analysis results for debugging purposes
          console.log('Transcript:', transcript);
          console.log('Analysis Results:', analysisObj);
        }

        // Save recording with proper metadata
        window.electron.ipcRenderer.sendMessage('save-recording', {
          buffer: Array.from(new Uint8Array(arrayBuffer)),
          fileName,
          ...metadata
        });

      } catch (error) {
        console.error('Failed to process recording:', error);
      } finally {
        setIsRecording(false);
        mediaRecorderRef.current = null;
      }
    } catch (error) {
      console.error('Failed to save recording:', error);
      setIsRecording(false);
      mediaRecorderRef.current = null;
    }
  }, [agent]);

  // Handle recording when audio session changes
  useEffect(() => {
    if (isAudioSessionActive && !isRecording && agent) {
      const startRecording = async () => {
        try {
          console.log('Requesting display media...');

          // First get system audio with minimal video
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: {
              displaySurface: 'browser',
              height: { ideal: 1 },
              width: { ideal: 1 },
              frameRate: { ideal: 1 },
            },
          });

          // Then get microphone audio with appropriate constraints
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });

          // Verify streams are valid
          if (
            !displayStream ||
            !displayStream.active ||
            !micStream ||
            !micStream.active
          ) {
            throw new Error('Invalid media stream');
          }

          // Get all audio tracks
          const displayAudioTracks = displayStream.getAudioTracks();
          const micAudioTracks = micStream.getAudioTracks();

          if (!displayAudioTracks.length && !micAudioTracks.length) {
            throw new Error('No audio tracks available');
          }

          // Log track information
          console.log(
            'Display audio tracks:',
            displayAudioTracks.map((track) => ({
              label: track.label,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
              settings: track.getSettings(),
            })),
          );

          console.log(
            'Microphone audio tracks:',
            micAudioTracks.map((track) => ({
              label: track.label,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
              settings: track.getSettings(),
            })),
          );

          // Create a new stream with both audio tracks
          const combinedStream = new MediaStream();

          // Create a single AudioContext for both sources
          const audioContext = new AudioContext();
          const destination = audioContext.createMediaStreamDestination();

          // Process microphone audio
          micAudioTracks.forEach((track) => {
            console.log('Adding and configuring microphone track:', track.label);
            track.enabled = true;
            const micSource = audioContext.createMediaStreamSource(micStream);
            const micGain = audioContext.createGain();
            micGain.gain.value = 1.0;
            micSource.connect(micGain);
            micGain.connect(destination);
            console.log('Microphone gain set to:', micGain.gain.value);
          });

          // Process system audio
          displayAudioTracks.forEach((track) => {
            console.log('Adding and configuring system audio track:', track.label);
            track.enabled = true;
            const sysSource = audioContext.createMediaStreamSource(displayStream);
            const sysGain = audioContext.createGain();
            sysGain.gain.value = 1.5;
            sysSource.connect(sysGain);
            sysGain.connect(destination);
            console.log('System audio gain set to:', sysGain.gain.value);
          });

          // Get the mixed audio track from destination
          const mixedTrack = destination.stream.getAudioTracks()[0];
          if (!mixedTrack) {
            throw new Error('Failed to get mixed audio track');
          }

          // Add the mixed track to combined stream
          combinedStream.addTrack(mixedTrack);

          // Verify tracks in combined stream
          const combinedTracks = combinedStream.getAudioTracks();
          console.log(
            'Combined stream tracks:',
            combinedTracks.map((track) => ({
              label: track.label,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
              settings: track.getSettings(),
            })),
          );

          // Use a supported MIME type with better audio settings
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';
          console.log('Using MIME type:', mimeType);

          const options = {
            mimeType,
            audioBitsPerSecond: 256000,
          };

          mediaRecorderRef.current = new MediaRecorder(combinedStream, options);

          let recordingStartTime = audioContext.currentTime;

          mediaRecorderRef.current.onstart = () => {
            console.log('MediaRecorder started');
            recordingStartTime = audioContext.currentTime;
          };

          const chunks: Blob[] = [];

          mediaRecorderRef.current.ondataavailable = (e: BlobEvent) => {
            console.log('Data available:', e.data.size, 'bytes');
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          mediaRecorderRef.current.onerror = async (event: Event) => {
            console.error('MediaRecorder error:', event);
            await handleRecordingStop(chunks, mimeType, audioContext.currentTime - recordingStartTime);
            displayStream.getTracks().forEach((track) => track.stop());
            micStream.getTracks().forEach((track) => track.stop());
            setIsRecording(false);
            setIsInCall(false);
          };

          mediaRecorderRef.current.onstop = async () => {
            await handleRecordingStop(chunks, mimeType, audioContext.currentTime - recordingStartTime);
          };

          try {
            console.log('Starting MediaRecorder...');
            mediaRecorderRef.current.start(1000);
            setIsRecording(true);
            setIsInCall(true);
          } catch (error) {
            console.error('Failed to start MediaRecorder:', error);
            audioContext.close();
            displayStream.getTracks().forEach((track) => track.stop());
            micStream.getTracks().forEach((track) => track.stop());
            throw error;
          }
        } catch (error) {
          console.error('Error starting recording:', error);
          setIsRecording(false);
          setIsInCall(false);
        }
      };

      startRecording();
    } else if (!isAudioSessionActive && isRecording) {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          console.log('Stopping recording due to audio session end');
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setIsInCall(false);
        if (mediaRecorderRef.current?.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach((track) => {
            track.stop();
          });
        }
        mediaRecorderRef.current = null;
      } catch (error) {
        console.error('Failed to stop recording:', error);
        setIsRecording(false);
        setIsInCall(false);
        mediaRecorderRef.current = null;
      }
    }
  }, [isAudioSessionActive, isRecording, agent, handleRecordingStop]);

  // Add error boundary and retry logic for IPC events
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000;

    const setupIpcListeners = () => {
      const cleanup = window.electron.ipcRenderer.on(
        'start-recording-with-source',
        (...args: unknown[]): void => {
          (async () => {
            const [data] = args as [{ sourceId: string; tempFilePath: string; finalFilePath: string }];
            try {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
              }
              const constraints: ElectronDesktopCaptureConstraints = {
                audio: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: data.sourceId,
                  },
                  optional: [{ echoCancellation: false }],
                },
                video: false,
              };
              console.log('Requesting media with constraints:', constraints);
              await navigator.mediaDevices.getUserMedia({ audio: true });
              console.log('Got audio permission');
              const stream = await (navigator.mediaDevices as any).getUserMedia(constraints);
              console.log('Got media stream:', stream);
              if (stream.getAudioTracks().length === 0) {
                throw new Error('No audio tracks available in the stream');
              }
              const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
              console.log('Using MIME type:', mimeType);
              const options = { mimeType };
              mediaRecorderRef.current = new MediaRecorder(stream, options);
              console.log('Created MediaRecorder:', mediaRecorderRef.current);
              const chunks: Blob[] = [];
              mediaRecorderRef.current.ondataavailable = (e: BlobEvent) => {
                console.log('Data available:', e.data.size);
                if (e.data.size > 0) {
                  chunks.push(e.data);
                }
              };
              mediaRecorderRef.current.onstop = () => {
                (async () => {
                  try {
                    console.log('Recording stopped, processing chunks...');
                    const blob = new Blob(chunks, { type: mimeType });
                    console.log('Created blob:', blob.size);
                    const buffer = await blob.arrayBuffer();
                    console.log('Created buffer:', buffer.byteLength);
                    window.electron.ipcRenderer.sendMessage('save-recording', {
                      buffer: Array.from(new Uint8Array(buffer)),
                      tempFilePath: data.tempFilePath,
                      finalFilePath: data.finalFilePath,
                    });
                    stream.getTracks().forEach((track: MediaStreamTrack) => {
                      track.stop();
                      stream.removeTrack(track);
                    });
                  } catch (error) {
                    console.error('Failed to save recording:', error);
                    setIsRecording(false);
                  }
                })();
              };
              mediaRecorderRef.current.onerror = (event: Event) => {
                console.error('MediaRecorder error:', event);
                setIsRecording(false);
                window.electron.ipcRenderer.sendMessage('recording-status', 'error');
              };
              console.log('Starting MediaRecorder...');
              mediaRecorderRef.current.start(1000);
              window.electron.ipcRenderer.sendMessage('recording-status', 'started');
            } catch (error) {
              console.error('Error starting recording:', error);
              if (retryCount < maxRetries) {
                retryCount += 1;
                console.log(`Retrying in ${retryDelay}ms... (Attempt ${retryCount}/${maxRetries})`);
                setTimeout(setupIpcListeners, retryDelay);
              } else {
                window.electron.ipcRenderer.sendMessage('recording-status', 'error');
                setIsRecording(false);
              }
            }
          })();
        }
      );

      return cleanup;
    };

    const cleanup = setupIpcListeners();
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  // Call timer - only run when isInCall is true
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    if (isInCall) {
      intervalId = setInterval(() => {
        setCallTimer((prevTimer) => prevTimer + 1);
      }, 1000);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isInCall]);

  // Work timer
  useEffect(() => {
    const intervalId = setInterval(() => {
      setWorkTimer((prevTimer) => prevTimer + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Updated useEffect for audio monitoring with delayed start and guarded cleanup
  useEffect(() => {
    if (!agent?.platform.name) return;
    const processName = getProcessName(agent.platform.name);
    if (!processName) return;

    let isCleanedUp = false;
    console.log('Starting audio monitoring for:', processName);
    window.electron.ipcRenderer.sendMessage('start-monitoring', processName);

    const cleanupListener = window.electron.ipcRenderer.on(
      'audio-session-update',
      (...args: unknown[]): void => {
        (async () => {
          const [active] = args;
          console.log(args);
          if (!isCleanedUp) {
            console.log('Audio session status changed:', active);
            setIsAudioSessionActive(active as boolean);
            if (!active && mediaRecorderRef.current?.state === 'recording') {
              console.log('Stopping recording due to audio session end');
              try {
                mediaRecorderRef.current.stop();
                await new Promise<void>((resolve) => { setTimeout(resolve, 1000); });
                if (mediaRecorderRef.current?.stream) {
                  mediaRecorderRef.current.stream.getTracks().forEach((track) => { track.stop(); });
                }
              } catch (error) {
                console.error('Error stopping recording on audio session end:', error);
              }
            }
          }
        })().then(() => undefined).catch((error) => { console.error(error); });
      }
    );

    const cleanupFunction = (): void => {
      console.log('Cleaning up audio monitoring');
      isCleanedUp = true;
      cleanupListener?.();
      window.electron.ipcRenderer.sendMessage('stop-monitoring');
      setTimeout(() => {
        if (!cleanupCalledRef.current) {
          endCall();
          cleanupCalledRef.current = true;
        }
      }, 1000);
    };

    return cleanupFunction; // eslint-disable-line consistent-return
  }, [agent, handleRecordingStop]);

  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on(
      'recording-status',
      (...args: unknown[]) => {
        const [status] = args;
        if (status === 'error') {
          console.error('Recording failed to start');
          setIsRecording(false);
        }
      },
    );
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Separate effect for handling recording state
  useEffect(() => {
    if (!isAudioSessionActive && isRecording && mediaRecorderRef.current) {
      try {
        console.log('Stopping recording due to audio session end');
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setIsInCall(false);
      } catch (error) {
        console.error('Failed to stop recording:', error);
      }
    }
  }, [isAudioSessionActive, isRecording]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

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
            <div className={`w-3 h-3 rounded-full mr-2 ${isAudioSessionActive ? 'bg-green-500' : 'bg-red-500'}`} />
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
            <h2 className="text-2xl font-bold text-gray-800">{agent.full_name}</h2>
            <p className="text-gray-600">Status: {agent.status}</p>
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

      {/* Call Control */}
      {!isInCall ? null : (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500">Current Call Duration</p>
              <p className="text-4xl font-mono font-bold text-purple-600">{formatTime(callTimer)}</p>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-2">Suggested Responses</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>&quot;I understand your concern...&quot;</li>
                  <li>&quot;Let me help you resolve this...&quot;</li>
                  <li>&quot;Would you like me to explain further?&quot;</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
