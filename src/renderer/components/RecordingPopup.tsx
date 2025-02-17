/* eslint-disable no-console */
/* eslint-disable prettier/prettier */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import analyzeAudio from '../../service/audioAnalysisService';

interface Agent {
    id: string;
    platform: { name: string };
}

interface BlobEvent extends Event {
    readonly data: Blob;
    readonly timecode: number;
}

const getProcessName = (platformName: string): string => {
    switch (platformName.toLowerCase()) {
        case 'teams':
            return 'ms-teams.exe';
        case 'zoom':
            return 'Zoom.exe';
        default:
            return '';
    }
};

export default function RecordingPopup() {
    const [recordingActive, setRecordingActive] = useState<boolean>(false);
    const [callDuration, setCallDuration] = useState<number>(0);
    const [agent, setAgent] = useState<Agent | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const agentData = localStorage.getItem('agent_data');
        if (agentData) {
            setAgent(JSON.parse(agentData));
        }
    }, []);

    const handleRecordingStop = useCallback(async (
        recordingChunks: Blob[],
        recordingMimeType: string,
        recordingDuration: number
    ) => {
        if (!isMountedRef.current) {
            console.warn('Component unmounted, aborting handleRecordingStop');
            return;
        }
        console.log('MediaRecorder stopped');
        try {
            console.log('Processing chunks...');
            if (recordingChunks.length === 0) {
                throw new Error('No audio data recorded');
            }

            const finalBlob = new Blob(recordingChunks, { type: recordingMimeType });
            const arrayBuffer = await finalBlob.arrayBuffer();
            const view = new DataView(arrayBuffer);
            const durationScale = 1000000000;
            const durationPos = arrayBuffer.byteLength - 8;
            view.setFloat64(durationPos, recordingDuration * durationScale);

            console.log('Final recording duration:', recordingDuration, 'seconds');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `recording-${timestamp}-${Math.round(recordingDuration)}s.webm`;

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

            try {
                console.log('Sending recording for analysis...');
                const analysisResponse = await analyzeAudio(formData);
                console.log('Analysis received:', analysisResponse);
                if (analysisResponse.object) {
                    const analysisObj = analysisResponse.object;
                    const transcript = analysisObj.segments.map((seg: any) => seg.transcript_english).join('\n');
                    console.log('Transcript:', transcript);
                    console.log('Analysis Results:', analysisObj);
                }

                window.electron.ipcRenderer.sendMessage('save-analysis', {
                    fileName,
                    analysis: analysisResponse.object,
                    metadata
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

    useEffect(() => {
        if (!agent?.platform?.name) return;
        const processName = getProcessName(agent.platform.name);
        if (!processName) return;

        console.log('Global: Starting audio monitoring for:', processName);
        window.electron.ipcRenderer.sendMessage('start-monitoring', processName);

        const listener = window.electron.ipcRenderer.on('audio-session-update', (...args: unknown[]) => {
            const [active] = args;
            setRecordingActive(Boolean(active));
        });

        const cleanup = (): void => {
            if (listener) listener();
            console.log('Stopping audio monitoring');
            window.electron.ipcRenderer.sendMessage('stop-monitoring');

            if (mediaRecorderRef.current?.state === 'recording') {
                console.log('Stopping active recording on unmount');
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            mediaRecorderRef.current = null;
        };

        // eslint-disable-next-line consistent-return
        return cleanup;
    }, [agent]);

    // Handle recording when audio session changes
    useEffect(() => {
        if (recordingActive && !isRecording && agent) {
            const startRecording = async () => {
                try {
                    console.log('Requesting display media...');
                    const displayStream = await navigator.mediaDevices.getDisplayMedia({
                        audio: true,
                        video: {
                            displaySurface: 'browser',
                            height: { ideal: 1 },
                            width: { ideal: 1 },
                            frameRate: { ideal: 1 },
                        },
                    });

                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });

                    if (!displayStream || !displayStream.active || !micStream || !micStream.active) {
                        throw new Error('Invalid media stream');
                    }

                    const displayAudioTracks = displayStream.getAudioTracks();
                    const micAudioTracks = micStream.getAudioTracks();

                    if (!displayAudioTracks.length && !micAudioTracks.length) {
                        throw new Error('No audio tracks available');
                    }

                    const combinedStream = new MediaStream();
                    const audioContext = new AudioContext();
                    audioContextRef.current = audioContext;
                    const destination = audioContext.createMediaStreamDestination();

                    micAudioTracks.forEach((track) => {
                        track.enabled = true;
                        const micSource = audioContext.createMediaStreamSource(micStream);
                        const micGain = audioContext.createGain();
                        micGain.gain.value = 1.0;
                        micSource.connect(micGain);
                        micGain.connect(destination);
                    });

                    displayAudioTracks.forEach((track) => {
                        track.enabled = true;
                        const sysSource = audioContext.createMediaStreamSource(displayStream);
                        const sysGain = audioContext.createGain();
                        sysGain.gain.value = 1.5;
                        sysSource.connect(sysGain);
                        sysGain.connect(destination);
                    });

                    const mixedTrack = destination.stream.getAudioTracks()[0];
                    if (!mixedTrack) {
                        throw new Error('Failed to get mixed audio track');
                    }

                    combinedStream.addTrack(mixedTrack);

                    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                        ? 'audio/webm;codecs=opus'
                        : 'audio/webm';

                    const options = {
                        mimeType,
                        audioBitsPerSecond: 256000,
                    };

                    mediaRecorderRef.current = new MediaRecorder(combinedStream, options);
                    let recordingStartTime = audioContext.currentTime;
                    const chunks: Blob[] = [];

                    mediaRecorderRef.current.onstart = () => {
                        console.log('MediaRecorder started');
                        recordingStartTime = audioContext.currentTime;
                    };

                    mediaRecorderRef.current.ondataavailable = (e: BlobEvent) => {
                        if (e.data && e.data.size > 0) {
                            chunks.push(e.data);
                        }
                    };

                    mediaRecorderRef.current.onerror = async (event: Event) => {
                        console.error('MediaRecorder error:', event);
                        if (!isMountedRef.current) {
                            setIsRecording(false);
                            return;
                        }
                        const audioCtx = audioContextRef.current;
                        if (audioCtx) {
                            await handleRecordingStop(chunks, mimeType, audioCtx.currentTime - recordingStartTime);
                        }
                        displayStream.getTracks().forEach((track) => track.stop());
                        micStream.getTracks().forEach((track) => track.stop());
                        setIsRecording(false);
                    };

                    mediaRecorderRef.current.onstop = async () => {
                        if (!isMountedRef.current) return;
                        const audioCtx = audioContextRef.current;
                        if (!audioCtx) {
                            console.warn('AudioContext unavailable in onstop');
                            return;
                        }
                        await handleRecordingStop(chunks, mimeType, audioCtx.currentTime - recordingStartTime);
                    };

                    try {
                        console.log('Starting MediaRecorder...');
                        mediaRecorderRef.current.start(1000);
                        setIsRecording(true);
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
                }
            };

            startRecording();
        } else if (!recordingActive && isRecording) {
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    console.log('Stopping recording due to audio session end');
                    mediaRecorderRef.current.stop();
                }
                setIsRecording(false);
                if (mediaRecorderRef.current?.stream) {
                    mediaRecorderRef.current.stream.getTracks().forEach((track) => {
                        track.stop();
                    });
                }
                mediaRecorderRef.current = null;
            } catch (error) {
                console.error('Failed to stop recording:', error);
                setIsRecording(false);
                mediaRecorderRef.current = null;
            }
        }
    }, [recordingActive, isRecording, agent, handleRecordingStop]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (recordingActive) {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            setCallDuration(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [recordingActive]);

    if (!recordingActive) return null;

    const formatTime = (seconds: number): string => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="text-center mb-6">
                    <p className="text-sm text-gray-500">Recording in progress</p>
                    <p className="text-4xl font-mono font-bold text-purple-600">{formatTime(callDuration)}</p>
                </div>
            </div>
        </div>
    );
}

export { getProcessName }; 