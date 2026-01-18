# MeetScribe

A local-first meeting transcription and notes app for macOS. Automatically detects when you join a Zoom or Google Meet call, transcribes in real-time with speaker identification, and generates AI-powered meeting summaries.

## Features

- **Meeting Detection**: Automatically detects Zoom, Google Meet, Microsoft Teams, Slack Huddles, and Discord calls
- **Real-time Transcription**: Live speech-to-text using Deepgram's Nova-2 model
- **Speaker Diarization**: Distinguishes between your voice (blue) and others (green) in the transcript
- **AI Summaries**: Generates meeting summaries with key points, decisions, and action items using Claude
- **Local Storage**: All data stored locally in SQLite - your meetings stay on your machine
- **System Audio Capture**: Captures both your microphone and system audio (what others say) without additional drivers

## Requirements

- macOS 12.3 or later
- Node.js 18+
- Deepgram API key (for transcription) - ~$0.0043/min
- Anthropic API key (optional, for summaries) - ~$0.003/1K tokens

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
cd meetscribe
npm install
```

3. Build and run:
```bash
npm start
```

Or for development:
```bash
npm run dev
```

## First-Time Setup

1. When MeetScribe first opens, click **Settings** in the sidebar

2. Enter your **Deepgram API Key**:
   - Sign up at [console.deepgram.com](https://console.deepgram.com)
   - Create a new API key
   - Deepgram offers $200 in free credits

3. (Optional) Enter your **Anthropic API Key** for AI summaries:
   - Get a key at [console.anthropic.com](https://console.anthropic.com)

4. Grant permissions when prompted:
   - **Microphone Access**: Required to capture your voice
   - **Screen Recording**: Required to capture system audio (what others say)

## Usage

### Manual Recording

1. Click the **Start Recording** button
2. Enter a meeting title
3. The app will capture both your microphone and system audio
4. Click **Stop Recording** when done
5. An AI summary will be generated automatically (if Anthropic key is configured)

### Automatic Detection

When MeetScribe detects a meeting app (Zoom, Google Meet, etc.):

1. A notification banner appears in the top-right
2. Click the record button to start transcribing
3. Recording automatically stops when the meeting ends

### Viewing Past Meetings

- All meetings appear in the left sidebar
- Click a meeting to view its transcript and summary
- Transcripts show speaker labels with timestamps
- Click the 🔄 button to regenerate summaries

## Cost Estimates

| Usage | Deepgram | Claude (summaries) |
|-------|----------|-------------------|
| 1 hour meeting | ~$0.26 | ~$0.01 |
| 10 hours/month | ~$2.60 | ~$0.10 |
| 40 hours/month | ~$10.40 | ~$0.40 |

## Building for Distribution

To create a distributable DMG:

```bash
npm run package
```

The DMG will be created in the `dist` folder.

## Technical Details

- **Electron** - Cross-platform desktop framework
- **electron-audio-loopback** - System audio capture without drivers
- **Deepgram Nova-2** - Real-time transcription with speaker diarization
- **Claude Sonnet** - Meeting summarization
- **better-sqlite3** - Local database storage

## Privacy

- All transcripts and recordings stay on your local machine
- Audio is streamed to Deepgram for transcription only (not stored)
- Meeting summaries are generated via API calls (not stored by Anthropic)
- No data is sent to any other third parties

## Troubleshooting

### "Screen Recording permission denied"
Go to System Settings → Privacy & Security → Screen Recording and enable MeetScribe

### "Microphone permission denied"  
Go to System Settings → Privacy & Security → Microphone and enable MeetScribe

### Transcription not working
- Check that your Deepgram API key is valid
- Ensure you have sufficient Deepgram credits
- Check the console for error messages (View → Toggle Developer Tools)

### No system audio captured
- Make sure Screen Recording permission is granted
- Restart the app after granting permissions
- Check that your meeting app's audio is not muted

## License

MIT
