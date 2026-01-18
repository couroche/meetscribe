import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Meetings
  getMeetings: () => ipcRenderer.invoke('get-meetings'),
  getMeeting: (id: number) => ipcRenderer.invoke('get-meeting', id),
  deleteMeeting: (id: number) => ipcRenderer.invoke('delete-meeting', id),
  
  // Recording
  startRecording: (title?: string) => ipcRenderer.invoke('start-recording', title),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Record<string, string>) => ipcRenderer.invoke('update-settings', settings),
  
  // Permissions
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
  
  // Summary
  regenerateSummary: (meetingId: number) => ipcRenderer.invoke('regenerate-summary', meetingId),
  
  // Audio loopback
  enableLoopbackAudio: () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),
  
  // Send audio data to main process
  sendAudioChunk: (buffer: ArrayBuffer, isUser: boolean) => {
    ipcRenderer.send('audio-chunk', { buffer, isUser });
  },
  
  // Event listeners
  onRecordingStarted: (callback: (data: { meetingId: number; title: string }) => void) => {
    ipcRenderer.on('recording-started', (_, data) => callback(data));
  },
  onRecordingStopped: (callback: (data: { meetingId: number }) => void) => {
    ipcRenderer.on('recording-stopped', (_, data) => callback(data));
  },
  onTranscriptSegment: (callback: (segment: any) => void) => {
    ipcRenderer.on('transcript-segment', (_, segment) => callback(segment));
  },
  onMeetingDetected: (callback: (data: { appName: string }) => void) => {
    ipcRenderer.on('meeting-detected', (_, data) => callback(data));
  },
  onTranscriptionReady: (callback: () => void) => {
    ipcRenderer.on('transcription-ready', () => callback());
  },
  onTranscriptionStopped: (callback: () => void) => {
    ipcRenderer.on('transcription-stopped', () => callback());
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getMeetings: () => Promise<any[]>;
      getMeeting: (id: number) => Promise<{ meeting: any; transcript: any[] }>;
      deleteMeeting: (id: number) => Promise<boolean>;
      startRecording: (title?: string) => Promise<number>;
      stopRecording: () => Promise<boolean>;
      getRecordingStatus: () => Promise<{ isRecording: boolean; currentMeetingId: number | null }>;
      getSettings: () => Promise<Record<string, string>>;
      updateSettings: (settings: Record<string, string>) => Promise<boolean>;
      checkPermissions: () => Promise<{ microphone: string; screen: string }>;
      requestMicPermission: () => Promise<boolean>;
      regenerateSummary: (meetingId: number) => Promise<string | null>;
      enableLoopbackAudio: () => Promise<void>;
      disableLoopbackAudio: () => Promise<void>;
      sendAudioChunk: (buffer: ArrayBuffer, isUser: boolean) => void;
      onRecordingStarted: (callback: (data: { meetingId: number; title: string }) => void) => void;
      onRecordingStopped: (callback: (data: { meetingId: number }) => void) => void;
      onTranscriptSegment: (callback: (segment: any) => void) => void;
      onMeetingDetected: (callback: (data: { appName: string }) => void) => void;
      onTranscriptionReady: (callback: () => void) => void;
      onTranscriptionStopped: (callback: () => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
