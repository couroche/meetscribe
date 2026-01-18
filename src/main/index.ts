import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, systemPreferences } from 'electron';
import { initMain } from 'electron-audio-loopback';
import * as path from 'path';
import { MeetingDetector } from './meetingDetector';
import { Database } from './database';
import { TranscriptionService } from './transcription';
import { SummaryService } from './summary';

// Initialize audio loopback before app ready
initMain();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let meetingDetector: MeetingDetector | null = null;
let database: Database | null = null;
let transcriptionService: TranscriptionService | null = null;
let summaryService: SummaryService | null = null;

// Current recording state
let isRecording = false;
let currentMeetingId: number | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hide window instead of closing when clicking X
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  // Create a simple tray icon (16x16 template image)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA1klEQVQ4y62TMQ6CQBBF3wIJBYWFtbEwtjY0HsPW3sPExt7Cg3gCYq8BE6OxsbCgIMYNsMvuOLOwxvgqJvPnz87MrhNCiB9FJAH6wBDo+bwJrIEnsASeqvoII0gCXRE5Alkg86gFKFQV4AhkWIGeT9TnPOxQ1TPQ9TiOYOyNxW7XKtB0OAd6qtrw9pVAXFXLNsvUXAZaQBk4AImINIB7GajcBbKqWnKBNNCOpb+6QB6I7Pv7BoAckI8DuAEb+xYTkPgXwA14ACtV3QEFoAmcPPcFfAF1sEd7GpylzgAAAABJRU5ErkJggg=='
  );
  icon.setTemplateImage(true);
  
  tray = new Tray(icon);
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRecording ? '⏹ Stop Recording' : '⏺ Start Recording',
      click: () => {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording('Manual Recording');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => mainWindow?.show(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);
  
  tray?.setContextMenu(contextMenu);
  tray?.setToolTip(isRecording ? 'MeetScribe - Recording...' : 'MeetScribe');
}

async function startRecording(meetingTitle: string) {
  if (isRecording || !database || !transcriptionService) return;
  
  // Create meeting record
  currentMeetingId = database.createMeeting(meetingTitle);
  
  // Start transcription
  await transcriptionService.start(currentMeetingId);
  
  isRecording = true;
  updateTrayMenu();
  
  // Notify renderer
  mainWindow?.webContents.send('recording-started', { meetingId: currentMeetingId, title: meetingTitle });
}

async function stopRecording() {
  if (!isRecording || !database || !transcriptionService || !currentMeetingId) return;
  
  // Stop transcription
  await transcriptionService.stop();
  
  // Update meeting end time
  database.endMeeting(currentMeetingId);
  
  // Generate summary
  if (summaryService) {
    const transcript = database.getTranscript(currentMeetingId);
    if (transcript.length > 0) {
      try {
        const summary = await summaryService.generateSummary(transcript);
        database.updateMeetingSummary(currentMeetingId, summary);
      } catch (error) {
        console.error('Failed to generate summary:', error);
      }
    }
  }
  
  const meetingId = currentMeetingId;
  isRecording = false;
  currentMeetingId = null;
  updateTrayMenu();
  
  // Notify renderer
  mainWindow?.webContents.send('recording-stopped', { meetingId });
}

function setupIPC() {
  // Get all meetings
  ipcMain.handle('get-meetings', () => {
    return database?.getMeetings() || [];
  });
  
  // Get single meeting with transcript
  ipcMain.handle('get-meeting', (_, meetingId: number) => {
    const meeting = database?.getMeeting(meetingId);
    const transcript = database?.getTranscript(meetingId) || [];
    return { meeting, transcript };
  });
  
  // Delete meeting
  ipcMain.handle('delete-meeting', (_, meetingId: number) => {
    database?.deleteMeeting(meetingId);
    return true;
  });
  
  // Start recording
  ipcMain.handle('start-recording', async (_, title?: string) => {
    await startRecording(title || 'Manual Recording');
    return currentMeetingId;
  });
  
  // Stop recording
  ipcMain.handle('stop-recording', async () => {
    await stopRecording();
    return true;
  });
  
  // Get recording status
  ipcMain.handle('get-recording-status', () => {
    return { isRecording, currentMeetingId };
  });
  
  // Get settings
  ipcMain.handle('get-settings', () => {
    return database?.getSettings() || {};
  });
  
  // Update settings
  ipcMain.handle('update-settings', (_, settings: Record<string, string>) => {
    for (const [key, value] of Object.entries(settings)) {
      database?.setSetting(key, value);
    }
    
    // Reinitialize services with new settings
    initializeServices();
    return true;
  });
  
  // Check permissions
  ipcMain.handle('check-permissions', async () => {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    return { microphone: micStatus, screen: screenStatus };
  });
  
  // Request permissions
  ipcMain.handle('request-mic-permission', async () => {
    return await systemPreferences.askForMediaAccess('microphone');
  });
  
  // Regenerate summary
  ipcMain.handle('regenerate-summary', async (_, meetingId: number) => {
    if (!summaryService || !database) return null;

    const transcript = database.getTranscript(meetingId);
    if (transcript.length === 0) return null;

    const summary = await summaryService.generateSummary(transcript);
    database.updateMeetingSummary(meetingId, summary);
    return summary;
  });

  // Audio loopback handlers (stubs - actual loopback is handled by electron-audio-loopback)
  ipcMain.handle('enable-loopback-audio', async () => {
    // electron-audio-loopback handles this automatically after initMain()
    return;
  });

  ipcMain.handle('disable-loopback-audio', async () => {
    // electron-audio-loopback handles this automatically
    return;
  });
}

function initializeServices() {
  const settings = database?.getSettings() || {};
  
  // Initialize transcription service
  const deepgramKey = settings.deepgramApiKey;
  if (deepgramKey) {
    transcriptionService = new TranscriptionService(deepgramKey, database!, (segment) => {
      mainWindow?.webContents.send('transcript-segment', segment);
    });
  }
  
  // Initialize summary service
  const anthropicKey = settings.anthropicApiKey;
  if (anthropicKey) {
    summaryService = new SummaryService(anthropicKey);
  }
}

app.whenReady().then(async () => {
  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'meetscribe.db');
  database = new Database(dbPath);
  
  // Initialize services
  initializeServices();
  
  // Create window and tray
  createWindow();
  createTray();
  setupIPC();
  
  // Initialize meeting detector
  meetingDetector = new MeetingDetector();
  meetingDetector.on('meeting-started', (appName: string) => {
    mainWindow?.webContents.send('meeting-detected', { appName });
    mainWindow?.show();
  });
  meetingDetector.on('meeting-ended', () => {
    if (isRecording) {
      stopRecording();
    }
  });
  meetingDetector.start();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  if (isRecording) {
    stopRecording();
  }
  meetingDetector?.stop();
  database?.close();
});
