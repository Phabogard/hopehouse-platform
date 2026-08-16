import { ForbiddenError, ValidationError } from '../../core/errors.js';
import type { Actor } from '../rbac/authorize.js';
import { defaultAiPolicyByRole, type AiPolicy } from './index.js';

const maxMessageLength = 12_000;
const defaultModel = 'gpt-5.6';

export interface AiChatResult {
  text: string;
  model: string;
}

export interface AiChatProvider {
  chat(actor: Actor, message: string, policy: AiPolicy): Promise<AiChatResult>;
}

export interface AiChatClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ResponsesApiPayload {
  output?: unknown;
}

function extractOutputText(payload: ResponsesApiPayload): string | null {
  if (!Array.isArray(payload.output)) return null;

  const textParts: string[] = [];
  for (const item of payload.output) {
    if (typeof item !== 'object' || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue;
      const type = (part as { type?: unknown }).type;
      const text = (part as { text?: unknown }).text;
      if (type === 'output_text' && typeof text === 'string') textParts.push(text);
    }
  }

  const result = textParts.join('');
  return result.trim().length > 0 ? result : null;
}

export class OpenAiResponsesClient implements AiChatProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AiChatClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = options.model ?? process.env.OPENAI_MODEL ?? defaultModel;
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chat(actor: Actor, message: string, policy: AiPolicy): Promise<AiChatResult> {
    if (!policy.enabled) throw new ForbiddenError('Assistant IA désactivé pour ce rôle');
    if (message.trim().length === 0) throw new ValidationError('Le message IA est obligatoire');
    if (message.length > maxMessageLength) throw new ValidationError('Le message IA est trop volumineux');
    if (this.apiKey.length === 0) throw new ForbiddenError('Assistant IA non configuré côté serveur');

    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        instructions: [
          'Tu es HopeHouse AI, un assistant métier intégré au backend HopeHouse.',
          `Rôle technique de l’utilisateur: ${actor.role}.`,
          'Respecte strictement les permissions et les limites de sécurité du backend.',
          'À ce stade tu peux uniquement répondre et raisonner sur la demande; tu ne dois jamais prétendre avoir modifié des données, effectué un paiement, annulé une commande ou exécuté une autre action métier.',
          'Si une action réelle est demandée, explique qu’elle nécessite l’outil métier autorisé et, selon son niveau de risque, une approbation humaine.',
          'Ne révèle jamais de secret, de clé API, de jeton ou de donnée d’authentification.',
        ].join('\n'),
        input: message,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI Responses API error (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = await response.json() as ResponsesApiPayload;
    const text = extractOutputText(payload);
    if (text === null) throw new Error('OpenAI Responses API n’a retourné aucun texte');

    return Object.freeze({ text, model: this.model });
  }
}

export function resolveLiveAiPolicy(actor: Actor): AiPolicy {
  const basePolicy = defaultAiPolicyByRole[actor.role];
  if (process.env.HOPEHOUSE_AI_ENABLED !== 'true') return basePolicy;
  return Object.freeze({ ...basePolicy, enabled: true });
}
