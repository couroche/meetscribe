import BetterSqlite3 from 'better-sqlite3';

export interface Meeting {
  id: number;
  title: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  duration: number | null;
}

export interface TranscriptSegment {
  id: number;
  meetingId: number;
  speaker: string;
  text: string;
  timestamp: number;
  isUser: boolean;
  confidence: number;
  createdAt: string;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.initialize();
  }

  private initialize() {
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Create meetings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transcript segments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transcript_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL,
        speaker TEXT NOT NULL DEFAULT 'Unknown',
        text TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        is_user BOOLEAN DEFAULT 0,
        confidence REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      )
    `);

    // Create settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments(meeting_id);
      CREATE INDEX IF NOT EXISTS idx_segments_timestamp ON transcript_segments(timestamp_ms);
      CREATE INDEX IF NOT EXISTS idx_meetings_started ON meetings(started_at);
    `);
  }

  // Meeting operations
  createMeeting(title: string): number {
    const stmt = this.db.prepare('INSERT INTO meetings (title) VALUES (?)');
    const result = stmt.run(title);
    return result.lastInsertRowid as number;
  }

  endMeeting(meetingId: number) {
    const stmt = this.db.prepare('UPDATE meetings SET ended_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(meetingId);
  }

  updateMeetingSummary(meetingId: number, summary: string) {
    const stmt = this.db.prepare('UPDATE meetings SET summary = ? WHERE id = ?');
    stmt.run(summary, meetingId);
  }

  getMeeting(meetingId: number): Meeting | null {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        title,
        started_at as startedAt,
        ended_at as endedAt,
        summary,
        CASE 
          WHEN ended_at IS NOT NULL 
          THEN CAST((julianday(ended_at) - julianday(started_at)) * 24 * 60 AS INTEGER)
          ELSE NULL
        END as duration
      FROM meetings 
      WHERE id = ?
    `);
    return stmt.get(meetingId) as Meeting | null;
  }

  getMeetings(limit = 50, offset = 0): Meeting[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        title,
        started_at as startedAt,
        ended_at as endedAt,
        summary,
        CASE 
          WHEN ended_at IS NOT NULL 
          THEN CAST((julianday(ended_at) - julianday(started_at)) * 24 * 60 AS INTEGER)
          ELSE NULL
        END as duration
      FROM meetings 
      ORDER BY started_at DESC 
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as Meeting[];
  }

  deleteMeeting(meetingId: number) {
    const stmt = this.db.prepare('DELETE FROM meetings WHERE id = ?');
    stmt.run(meetingId);
  }

  // Transcript operations
  addTranscriptSegment(
    meetingId: number,
    speaker: string,
    text: string,
    timestampMs: number,
    isUser: boolean,
    confidence: number
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO transcript_segments (meeting_id, speaker, text, timestamp_ms, is_user, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(meetingId, speaker, text, timestampMs, isUser ? 1 : 0, confidence);
    return result.lastInsertRowid as number;
  }

  getTranscript(meetingId: number): TranscriptSegment[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        meeting_id as meetingId,
        speaker,
        text,
        timestamp_ms as timestamp,
        is_user as isUser,
        confidence,
        created_at as createdAt
      FROM transcript_segments 
      WHERE meeting_id = ? 
      ORDER BY timestamp_ms ASC
    `);
    return stmt.all(meetingId) as TranscriptSegment[];
  }

  // Settings operations
  getSetting(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  getSettings(): Record<string, string> {
    const stmt = this.db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  // Search
  searchMeetings(query: string): Meeting[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT
        m.id,
        m.title,
        m.started_at as startedAt,
        m.ended_at as endedAt,
        m.summary,
        CASE 
          WHEN m.ended_at IS NOT NULL 
          THEN CAST((julianday(m.ended_at) - julianday(m.started_at)) * 24 * 60 AS INTEGER)
          ELSE NULL
        END as duration
      FROM meetings m
      LEFT JOIN transcript_segments ts ON m.id = ts.meeting_id
      WHERE m.title LIKE ? OR m.summary LIKE ? OR ts.text LIKE ?
      ORDER BY m.started_at DESC
      LIMIT 50
    `);
    const searchTerm = `%${query}%`;
    return stmt.all(searchTerm, searchTerm, searchTerm) as Meeting[];
  }

  close() {
    this.db.close();
  }
}
