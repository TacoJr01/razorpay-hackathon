import { streamText, isStepCount, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { AgentStreamEvent } from '@b2b-agent/shared';
import { SYSTEM_PROMPT } from './prompt.js';
import { buildTools } from './tools.js';

/**
 * Swapping providers is an env change (LLM_PROVIDER), not a code change -
 * useful for prototyping against a free tier (Google) before switching to
 * Claude/GPT for a final build. All three go through the same tool-calling
 * loop below; nothing else in agent/ knows which provider is active.
 */
function resolveModel() {
  const provider = process.env.LLM_PROVIDER ?? 'anthropic';
  if (provider === 'openai') {
    return openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }
  if (provider === 'google') {
    return google(process.env.GOOGLE_MODEL ?? 'gemini-3.1-flash-lite');
  }
  return anthropic(process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022');
}

export interface AgentTurnResult {
  messages: ModelMessage[];
}

/**
 * Runs one agent turn end to end: parse intent (native model reasoning) ->
 * retrieve catalog data / negotiate / check bounds / gate / act, via the
 * tool-calling loop -> every tool call and result is forwarded to `onEvent`
 * as its own inspectable step, live, over SSE.
 */
export async function runAgentTurn(
  messages: ModelMessage[],
  buyerId: string,
  onEvent: (event: AgentStreamEvent) => void | Promise<void>,
): Promise<AgentTurnResult> {
  const tools = buildTools(buyerId);

  const result = streamText({
    model: resolveModel(),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: isStepCount(8),
  });

  // The AI SDK delivers stream-level failures (e.g. a missing/invalid API
  // key, a provider error mid-generation) as an 'error' part on the stream
  // rather than a thrown exception. If we see one, result.response never
  // resolves (there's no 'finish' part to satisfy it), so we must stop
  // consuming here instead of awaiting it - otherwise this request hangs
  // open forever.
  let errored = false;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        await onEvent({ type: 'reasoning', text: part.text });
        break;
      case 'tool-call':
        await onEvent({ type: 'tool_call', name: part.toolName, args: part.input });
        break;
      case 'tool-result':
        await onEvent({ type: 'tool_result', name: part.toolName, result: part.output });
        if (part.toolName === 'checkOrderGate') {
          const r = part.output as { allPass: boolean; gateTriggered?: boolean; reason?: string; draftId?: string; total?: number; items?: unknown };
          if (r.allPass && r.gateTriggered && r.draftId) {
            await onEvent({
              type: 'gate',
              reason: r.reason ?? 'Requires explicit confirmation.',
              gateId: r.draftId,
              orderDraft: { items: r.items as never, total: r.total ?? 0, reason: r.reason ?? '' },
            });
          }
        }
        break;
      case 'error':
        errored = true;
        await onEvent({ type: 'error', message: String(part.error) });
        break;
      default:
        break;
    }
  }

  if (errored) {
    return { messages };
  }

  const response = await result.response;
  return { messages: [...messages, ...response.messages] };
}
