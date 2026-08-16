import { ForbiddenError, ValidationError } from '../../core/errors.js';
import { can, type Actor } from '../rbac/authorize.js';
import type { Permission, Role } from '../rbac/permissions.js';

export type AiRiskLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type AiApprovalMode = 'never' | 'when_required' | 'always';

export interface AiPolicy {
  enabled: boolean;
  maxRiskLevel: Exclude<AiRiskLevel, 'L4'>;
  approvalMode: AiApprovalMode;
  maxActionsPerSession: number;
  maxFinancialAmountCents: number | null;
  allowedTools: readonly string[];
  blockedTools: readonly string[];
}

export interface AiToolDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  riskLevel: AiRiskLevel;
  requiredPermissions: readonly Permission[];
  execute(input: TInput, context: AiToolExecutionContext): Promise<TResult>;
}

export interface AiToolExecutionContext {
  actor: Actor;
  sessionId: string;
  requestId: string;
  approved: boolean;
}

export interface AiToolCall<TInput = unknown> {
  toolName: string;
  input: TInput;
  financialAmountCents?: number | null;
}

export interface AiToolExecutionResult<TResult = unknown> {
  status: 'executed' | 'approval_required' | 'denied';
  result?: TResult;
  reason?: string;
}

const riskRank: Record<AiRiskLevel, number> = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 });

export const defaultAiPolicyByRole: Readonly<Record<Role, AiPolicy>> = Object.freeze({
  system_admin: {
    enabled: false,
    maxRiskLevel: 'L2',
    approvalMode: 'when_required',
    maxActionsPerSession: 25,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
  business_admin: {
    enabled: false,
    maxRiskLevel: 'L1',
    approvalMode: 'always',
    maxActionsPerSession: 10,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
  operations_agent: {
    enabled: false,
    maxRiskLevel: 'L1',
    approvalMode: 'always',
    maxActionsPerSession: 10,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
  finance_manager: {
    enabled: false,
    maxRiskLevel: 'L1',
    approvalMode: 'always',
    maxActionsPerSession: 10,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
  client: {
    enabled: false,
    maxRiskLevel: 'L0',
    approvalMode: 'always',
    maxActionsPerSession: 5,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
  accountant: {
    enabled: false,
    maxRiskLevel: 'L1',
    approvalMode: 'always',
    maxActionsPerSession: 10,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
  auditor: {
    enabled: false,
    maxRiskLevel: 'L0',
    approvalMode: 'never',
    maxActionsPerSession: 20,
    maxFinancialAmountCents: null,
    allowedTools: [],
    blockedTools: [],
  },
});

export function canAiUseTool(policy: AiPolicy, tool: AiToolDefinition, actor: Actor): boolean {
  if (!policy.enabled) return false;
  if (riskRank[tool.riskLevel] > riskRank[policy.maxRiskLevel]) return false;
  if (policy.blockedTools.includes(tool.name)) return false;
  if (policy.allowedTools.length > 0 && !policy.allowedTools.includes(tool.name)) return false;
  return tool.requiredPermissions.every((permission) => can(actor, permission));
}

export class AiToolGateway {
  private readonly tools = new Map<string, AiToolDefinition>();
  private readonly actionCounts = new Map<string, number>();

  register<TInput, TResult>(tool: AiToolDefinition<TInput, TResult>): void {
    if (!tool.name.trim()) throw new ValidationError('Le nom de l’outil IA est obligatoire');
    if (tool.riskLevel === 'L4') throw new ValidationError('Les outils IA L4 sont interdits');
    if (this.tools.has(tool.name)) throw new ValidationError(`Outil IA déjà enregistré: ${tool.name}`);
    this.tools.set(tool.name, tool as AiToolDefinition);
  }

  async execute<TInput, TResult>(
    call: AiToolCall<TInput>,
    context: AiToolExecutionContext,
    policy: AiPolicy,
  ): Promise<AiToolExecutionResult<TResult>> {
    const tool = this.tools.get(call.toolName) as AiToolDefinition<TInput, TResult> | undefined;
    if (tool === undefined) return { status: 'denied', reason: 'Outil IA inconnu' };
    if (!canAiUseTool(policy, tool, context.actor)) return { status: 'denied', reason: 'Outil IA non autorisé' };

    const count = this.actionCounts.get(context.sessionId) ?? 0;
    if (count >= policy.maxActionsPerSession) {
      return { status: 'denied', reason: 'Limite d’actions IA atteinte pour cette session' };
    }

    if (call.financialAmountCents !== undefined && call.financialAmountCents !== null) {
      if (policy.maxFinancialAmountCents === null || call.financialAmountCents > policy.maxFinancialAmountCents) {
        return { status: 'denied', reason: 'Limite financière IA dépassée' };
      }
    }

    const requiresApproval = tool.riskLevel === 'L3' || policy.approvalMode === 'always';
    if (requiresApproval && !context.approved) {
      return { status: 'approval_required', reason: 'Approbation humaine requise' };
    }

    this.actionCounts.set(context.sessionId, count + 1);
    const result = await tool.execute(call.input, context);
    return { status: 'executed', result };
  }
}

export function assertSafeAiPolicy(policy: AiPolicy): void {
  if (policy.maxActionsPerSession < 1 || policy.maxActionsPerSession > 100) {
    throw new ValidationError('maxActionsPerSession IA hors limites');
  }
  if (policy.maxFinancialAmountCents !== null && policy.maxFinancialAmountCents < 0) {
    throw new ValidationError('maxFinancialAmountCents IA invalide');
  }
  if (policy.allowedTools.some((name) => policy.blockedTools.includes(name))) {
    throw new ForbiddenError('Un outil IA ne peut pas être simultanément autorisé et bloqué');
  }
}
