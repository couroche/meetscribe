import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { Database, TranscriptSegment } from './database';
import { ipcMain, BrowserWindow } from 'electron';

interface TranscriptCallback {
  (segment: Partial<TranscriptSegment>): void;
}

export class TranscriptionService {
  private deepgram: ReturnType<typeof createClient>;
  private connection: LiveClient | null = null;
  private database: Database;
  private onSegment: TranscriptCallback;
  private currentMeetingId: number | null = null;
  private startTime: number = 0;
  private isUserSpeaking = false;
  private mediaRecorder: any = null;

  constructor(apiKey: string, database: Database, onSegment: TranscriptCallback) {
    this.deepgram = createClient(apiKey);
    this.database = database;
    this.onSegment = onSegment;
    
    this.setupIPC();
  }

  private setupIPC() {
    // Receive audio chunks from renderer
    ipcMain.on('audio-chunk', (_, data: { buffer: ArrayBuffer; isUser: boolean }) => {
      if (this.connection) {
        this.isUserSpeaking = data.isUser;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.connection as any).send(Buffer.from(data.buffer));
      }
    });
  }

  async start(meetingId: number) {
    this.currentMeetingId = meetingId;
    this.startTime = Date.now();

    try {
      // Create live transcription connection with speaker diarization
      this.connection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
        diarize: true, // Enable speaker diarization
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      });

      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram connection opened');
        
        // Notify renderer to start capturing audio
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('transcription-ready');
        });
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0];
        if (!transcript || !transcript.transcript) return;

        const text = transcript.transcript.trim();
        if (!text) return;

        // Get speaker info from diarization
        const words = transcript.words || [];
        let speaker = 'Speaker';
        let speakerNum = 0;
        
        if (words.length > 0 && words[0].speaker !== undefined) {
          speakerNum = words[0].speaker;
          speaker = `Speaker ${speakerNum + 1}`;
        }

        // Determine if this is the user based on audio source flag
        // Speaker 0 is typically the user (mic input)
        const isUser = speakerNum === 0 || this.isUserSpeaking;

        const timestamp = Date.now() - this.startTime;
        const confidence = transcript.confidence || 1.0;

        // Only save final results
        if (data.is_final && this.currentMeetingId) {
          const segmentId = this.database.addTranscriptSegment(
            this.currentMeetingId,
            isUser ? 'You' : speaker,
            text,
            timestamp,
            isUser,
            confidence
          );

          const segment: Partial<TranscriptSegment> = {
            id: segmentId,
            meetingId: this.currentMeetingId,
            speaker: isUser ? 'You' : speaker,
            text,
            timestamp,
            isUser,
            confidence,
          };

          this.onSegment(segment);
        } else {
          // Send interim results for real-time display
          this.onSegment({
            speaker: isUser ? 'You' : speaker,
            text,
            timestamp,
            isUser,
            confidence,
          });
        }
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram connection closed');
      });

    } catch (error) {
      console.error('Failed to start transcription:', error);
      throw error;
    }
  }

  async stop() {
    // Notify renderer to stop audio capture
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('transcription-stopped');
    });

    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }

    this.currentMeetingId = null;
  }

  isActive(): boolean {
    return this.connection !== null;
  }
}
