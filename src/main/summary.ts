import Anthropic from '@anthropic-ai/sdk';
import { TranscriptSegment } from './database';

export class SummaryService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateSummary(transcript: TranscriptSegment[]): Promise<string> {
    if (transcript.length === 0) {
      return 'No transcript available.';
    }

    // Format transcript for the prompt
    const formattedTranscript = transcript
      .map((seg) => {
        const minutes = Math.floor(seg.timestamp / 60000);
        const seconds = Math.floor((seg.timestamp % 60000) / 1000);
        const time = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return `[${time}] ${seg.speaker}: ${seg.text}`;
      })
      .join('\n');

    const prompt = `You are an expert meeting summarizer. Analyze the following meeting transcript and provide a comprehensive summary.

TRANSCRIPT:
${formattedTranscript}

Please provide a summary with the following sections:

## Overview
A brief 2-3 sentence overview of what the meeting was about.

## Key Discussion Points
Bullet points of the main topics discussed.

## Decisions Made
Any decisions that were reached during the meeting.

## Action Items
Tasks or follow-ups mentioned, with the responsible person if identified.

## Notable Quotes
Any particularly important or memorable statements (optional, include only if relevant).

Keep the summary concise but informative. Use clear, professional language.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        return textBlock.text;
      }

      return 'Unable to generate summary.';
    } catch (error) {
      console.error('Summary generation error:', error);
      throw error;
    }
  }

  async generateActionItems(transcript: TranscriptSegment[]): Promise<string[]> {
    if (transcript.length === 0) {
      return [];
    }

    const formattedTranscript = transcript
      .map((seg) => `${seg.speaker}: ${seg.text}`)
      .join('\n');

    const prompt = `Extract action items from this meeting transcript. Return ONLY a JSON array of strings, each being an action item. Include the responsible person if mentioned.

TRANSCRIPT:
${formattedTranscript}

Return format: ["Action item 1", "Action item 2", ...]`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        try {
          return JSON.parse(textBlock.text);
        } catch {
          return [];
        }
      }

      return [];
    } catch (error) {
      console.error('Action items extraction error:', error);
      return [];
    }
  }
}
