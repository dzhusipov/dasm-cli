/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  type CountTokensResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  type EmbedContentResponse,
  type EmbedContentParameters,
  type Content,
  type Part,
  type FunctionCall,
  type FunctionResponse,
  type ContentListUnion,
  type ToolListUnion,
  FinishReason,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';

/**
 * Ollama API types (OpenAI-compatible)
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  tools?: OllamaTool[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

interface OllamaResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OllamaToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OllamaStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: OllamaToolCall[];
    };
    finish_reason: string | null;
  }>;
}

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
}

/**
 * Content generator that uses Ollama's OpenAI-compatible API
 */
export class OllamaContentGenerator implements ContentGenerator {
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: OllamaConfig = {}) {
    this.baseUrl =
      config.baseUrl ||
      process.env['OLLAMA_BASE_URL'] ||
      'http://localhost:11434';
    this.defaultModel =
      config.model || process.env['OLLAMA_MODEL'] || 'devstral:24b';
  }

  /**
   * Normalize contents to array of Content
   */
  private normalizeContents(contents: ContentListUnion): Content[] {
    if (Array.isArray(contents)) {
      return contents.filter((c): c is Content => (
          typeof c === 'object' &&
          c !== null &&
          'parts' in c &&
          c.parts !== undefined
        ));
    }
    if (
      typeof contents === 'object' &&
      contents !== null &&
      'parts' in contents &&
      contents.parts !== undefined
    ) {
      return [contents as Content];
    }
    return [];
  }

  /**
   * Convert Gemini Content format to Ollama messages
   */
  private convertToOllamaMessages(contents: Content[]): OllamaMessage[] {
    const messages: OllamaMessage[] = [];

    for (const content of contents) {
      const role = this.convertRole(content.role || 'user');
      const parts = Array.isArray(content.parts)
        ? content.parts
        : [content.parts];

      let textContent = '';
      let toolCalls: OllamaToolCall[] | undefined;
      let toolCallId: string | undefined;

      for (const part of parts) {
        if (!part) continue;

        if ('text' in part && part.text) {
          textContent += part.text;
        } else if ('functionCall' in part && part.functionCall) {
          // Convert Gemini function call to Ollama tool call
          const fc = part.functionCall as FunctionCall;
          if (!toolCalls) toolCalls = [];
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: {
              name: fc.name || '',
              arguments: JSON.stringify(fc.args || {}),
            },
          });
        } else if ('functionResponse' in part && part.functionResponse) {
          // Convert Gemini function response to Ollama tool response
          const fr = part.functionResponse as FunctionResponse;
          toolCallId = `call_${fr.name || 'unknown'}`;
          textContent = JSON.stringify(fr.response);
        }
      }

      messages.push({
        role,
        content: textContent,
        ...(toolCalls && { tool_calls: toolCalls }),
        ...(toolCallId && { tool_call_id: toolCallId }),
      });
    }

    return messages;
  }

  /**
   * Convert Gemini role to Ollama role
   */
  private convertRole(role: string): 'system' | 'user' | 'assistant' | 'tool' {
    switch (role) {
      case 'model':
        return 'assistant';
      case 'function':
        return 'tool';
      default:
        return role as 'system' | 'user' | 'assistant' | 'tool';
    }
  }

  /**
   * Convert Gemini tools to Ollama tools
   */
  private convertTools(
    tools: ToolListUnion | undefined,
  ): OllamaTool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    const ollamaTools: OllamaTool[] = [];

    for (const tool of tools) {
      // Extract function declarations from Tool
      const declarations =
        'functionDeclarations' in tool ? tool.functionDeclarations : undefined;

      if (declarations) {
        for (const decl of declarations) {
          if (decl.name) {
            ollamaTools.push({
              type: 'function',
              function: {
                name: decl.name,
                description: decl.description,
                parameters: decl.parameters,
              },
            });
          }
        }
      }
    }

    return ollamaTools.length > 0 ? ollamaTools : undefined;
  }

  /**
   * Convert Ollama response to Gemini format
   */
  private convertToGeminiResponse(
    ollamaResponse: OllamaResponse,
  ): GenerateContentResponse {
    const choice = ollamaResponse.choices[0];
    if (!choice) {
      throw new Error('No choices in Ollama response');
    }

    const parts: Part[] = [];

    // Add text content if present
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // Add tool calls if present
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        });
      }
    }

    const response = new GenerateContentResponse();
    response.candidates = [
      {
        index: 0,
        content: {
          role: 'model',
          parts,
        },
        finishReason: this.convertFinishReason(choice.finish_reason),
      },
    ];

    if (ollamaResponse.usage) {
      response.usageMetadata = {
        promptTokenCount: ollamaResponse.usage.prompt_tokens,
        candidatesTokenCount: ollamaResponse.usage.completion_tokens,
        totalTokenCount: ollamaResponse.usage.total_tokens,
      };
    }

    response.modelVersion = ollamaResponse.model;
    response.responseId = ollamaResponse.id;

    return response;
  }

  /**
   * Convert Ollama finish_reason to Gemini format
   */
  private convertFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'stop':
        return FinishReason.STOP;
      case 'length':
        return FinishReason.MAX_TOKENS;
      case 'tool_calls':
        return FinishReason.STOP;
      default:
        return FinishReason.OTHER;
    }
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const messages = this.convertToOllamaMessages(
      this.normalizeContents(request.contents),
    );

    // Add system instruction if present
    if (request.config?.systemInstruction) {
      const systemContent =
        typeof request.config.systemInstruction === 'string'
          ? request.config.systemInstruction
          : (request.config.systemInstruction as Content).parts
              ?.map((p: Part) => ('text' in p ? p.text : ''))
              .join('') || '';

      messages.unshift({
        role: 'system',
        content: systemContent,
      });
    }

    const ollamaRequest: OllamaRequest = {
      model: request.model || this.defaultModel,
      messages,
      stream: false,
      temperature: request.config?.temperature,
      top_p: request.config?.topP,
      max_tokens: request.config?.maxOutputTokens,
      tools: this.convertTools(request.config?.tools),
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const ollamaResponse: OllamaResponse = await response.json();
    return this.convertToGeminiResponse(ollamaResponse);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = this.convertToOllamaMessages(
      this.normalizeContents(request.contents),
    );

    // Add system instruction if present
    if (request.config?.systemInstruction) {
      const systemContent =
        typeof request.config.systemInstruction === 'string'
          ? request.config.systemInstruction
          : (request.config.systemInstruction as Content).parts
              ?.map((p: Part) => ('text' in p ? p.text : ''))
              .join('') || '';

      messages.unshift({
        role: 'system',
        content: systemContent,
      });
    }

    const ollamaRequest: OllamaRequest = {
      model: request.model || this.defaultModel,
      messages,
      stream: true,
      temperature: request.config?.temperature,
      top_p: request.config?.topP,
      max_tokens: request.config?.maxOutputTokens,
      tools: this.convertTools(request.config?.tools),
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama');
    }

    // Return an async generator
    const convertFinishReason = this.convertFinishReason.bind(this);

    async function* streamGenerator() {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;

            const jsonStr = trimmed.startsWith('data: ')
              ? trimmed.substring(6)
              : trimmed;

            try {
              const chunk: OllamaStreamChunk = JSON.parse(jsonStr);
              const choice = chunk.choices[0];
              if (!choice) continue;

              const deltaContent = choice.delta.content || '';

              const geminiResponse = new GenerateContentResponse();
              geminiResponse.candidates = [
                {
                  index: 0,
                  content: {
                    role: 'model',
                    parts: [{ text: deltaContent }],
                  },
                  finishReason: convertFinishReason(choice.finish_reason),
                },
              ];

              geminiResponse.modelVersion = chunk.model;
              geminiResponse.responseId = chunk.id;

              yield geminiResponse;
            } catch (parseError) {
              console.error(
                'Error parsing SSE chunk:',
                parseError,
                'Line:',
                jsonStr,
              );
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    return streamGenerator();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Ollama doesn't have a native token counting endpoint
    // We'll provide a rough estimate based on the content
    const messages = this.convertToOllamaMessages(
      this.normalizeContents(request.contents),
    );

    const totalText = messages.map((m) => m.content).join(' ');
    // Rough estimate: ~4 characters per token
    const estimatedTokens = Math.ceil(totalText.length / 4);

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Ollama has embeddings API but it's different from chat completions
    // For now, throw an error indicating it's not supported
    throw new Error(
      'embedContent is not yet implemented for Ollama. Use Ollama embeddings API directly if needed.',
    );
  }
}
