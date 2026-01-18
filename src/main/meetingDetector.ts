import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface MeetingApp {
  name: string;
  processNames: string[];
  windowTitles: string[];
}

const MEETING_APPS: MeetingApp[] = [
  {
    name: 'Zoom',
    processNames: ['zoom.us', 'CptHost'],
    windowTitles: ['Zoom Meeting', 'Zoom Webinar'],
  },
  {
    name: 'Google Meet',
    processNames: ['Google Chrome', 'Arc', 'Safari', 'Firefox', 'Microsoft Edge'],
    windowTitles: ['Meet -', 'meet.google.com'],
  },
  {
    name: 'Microsoft Teams',
    processNames: ['Microsoft Teams', 'Teams'],
    windowTitles: ['Microsoft Teams'],
  },
  {
    name: 'Slack Huddle',
    processNames: ['Slack'],
    windowTitles: ['Huddle'],
  },
  {
    name: 'Discord',
    processNames: ['Discord'],
    windowTitles: ['Voice Connected'],
  },
];

export class MeetingDetector extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private activeMeeting: string | null = null;
  private readonly pollMs = 3000; // Check every 3 seconds

  start() {
    if (this.pollInterval) return;
    
    this.pollInterval = setInterval(() => {
      this.checkForMeetings();
    }, this.pollMs);
    
    // Check immediately
    this.checkForMeetings();
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async checkForMeetings() {
    try {
      const activeApp = await this.detectActiveMeeting();
      
      if (activeApp && !this.activeMeeting) {
        // Meeting started
        this.activeMeeting = activeApp;
        this.emit('meeting-started', activeApp);
      } else if (!activeApp && this.activeMeeting) {
        // Meeting ended
        this.activeMeeting = null;
        this.emit('meeting-ended');
      }
    } catch (error) {
      // Silently handle errors in detection
      console.error('Meeting detection error:', error);
    }
  }

  private async detectActiveMeeting(): Promise<string | null> {
    // Use AppleScript to get list of running apps and their windows
    const script = `
      tell application "System Events"
        set appList to ""
        repeat with proc in (every process whose background only is false)
          set procName to name of proc
          try
            repeat with win in (every window of proc)
              set winTitle to name of win
              set appList to appList & procName & "|" & winTitle & "\\n"
            end repeat
          end try
        end repeat
        return appList
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [processName, windowTitle] = line.split('|');
        if (!processName || !windowTitle) continue;

        for (const app of MEETING_APPS) {
          const processMatch = app.processNames.some(
            (p) => processName.toLowerCase().includes(p.toLowerCase())
          );
          const titleMatch = app.windowTitles.some(
            (t) => windowTitle.toLowerCase().includes(t.toLowerCase())
          );

          if (processMatch && titleMatch) {
            return app.name;
          }
        }
      }
    } catch (error) {
      // Fallback: check running processes
      return this.detectMeetingByProcess();
    }

    return null;
  }

  private async detectMeetingByProcess(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('ps aux');
      const processes = stdout.toLowerCase();

      // Check for Zoom specifically (most reliable)
      if (processes.includes('zoom.us') && processes.includes('cpthost')) {
        return 'Zoom';
      }

      // Check for Teams
      if (processes.includes('microsoft teams')) {
        return 'Microsoft Teams';
      }

      return null;
    } catch {
      return null;
    }
  }

  getCurrentMeeting(): string | null {
    return this.activeMeeting;
  }
}
