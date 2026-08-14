export type AppSettingStatus = 'draft' | 'active' | 'archived';

export interface AppSettingScope {
  readonly type: string;
  readonly id: string | null;
}

export interface AppSetting {
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly scope: AppSettingScope;
  readonly status: AppSettingStatus;
  readonly value: unknown;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly createdByUserId: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AppSettingRepository {
  findByIdentity(input: { namespace: string; key: string; scope: AppSettingScope }): Promise<readonly AppSetting[]>;
}

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

function isNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

function isRuntimeValue(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseOptionalDate(value: string | null): number | null {
  if (value === null) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isApplicable(setting: AppSetting, nowMs: number): boolean {
  if (setting.status !== 'active') return false;
  if (!isRuntimeValue(setting.value)) return false;

  const startsAtMs = parseOptionalDate(setting.startsAt);
  if (setting.startsAt !== null && startsAtMs === null) return false;
  if (startsAtMs !== null && startsAtMs > nowMs) return false;

  const endsAtMs = parseOptionalDate(setting.endsAt);
  if (setting.endsAt !== null && endsAtMs === null) return false;
  if (endsAtMs !== null && endsAtMs <= nowMs) return false;

  return true;
}

function sameScope(left: AppSettingScope, right: AppSettingScope): boolean {
  return left.type === right.type && left.id === right.id;
}

export class ConfigurationService {
  constructor(private readonly input: { readonly repository: AppSettingRepository; readonly clock?: Clock }) {}

  async resolve(input: { namespace: string; key: string; scope: AppSettingScope }): Promise<AppSetting | null> {
    if (!isNonEmptyText(input.namespace) || !isNonEmptyText(input.key) || !isNonEmptyText(input.scope.type)) return null;

    const scope = Object.freeze({ type: input.scope.type.trim(), id: input.scope.id });
    const candidates = await this.input.repository.findByIdentity({ namespace: input.namespace.trim(), key: input.key.trim(), scope });
    const nowMs = (this.input.clock ?? new SystemClock()).now().getTime();
    const applicable = candidates.find((setting) => (
      setting.namespace === input.namespace.trim()
      && setting.key === input.key.trim()
      && sameScope(setting.scope, scope)
      && isApplicable(setting, nowMs)
    ));

    return applicable ?? null;
  }
}

export class InMemoryAppSettingRepository implements AppSettingRepository {
  private readonly records: readonly AppSetting[];

  constructor(settings: readonly AppSetting[] = []) {
    this.records = Object.freeze([...settings]);
  }

  async findByIdentity(input: { namespace: string; key: string; scope: AppSettingScope }): Promise<readonly AppSetting[]> {
    return Object.freeze(this.records.filter((setting) => (
      setting.namespace === input.namespace
      && setting.key === input.key
      && sameScope(setting.scope, input.scope)
    )));
  }
}
