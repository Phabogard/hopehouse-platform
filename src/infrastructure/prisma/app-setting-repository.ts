import type { AppSetting, AppSettingRepository, AppSettingStatus } from '../../modules/configuration/index.js';
import { toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaAppSettingRecord = {
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly status: AppSettingStatus;
  readonly value: unknown;
  readonly startsAt: Date | string | null;
  readonly endsAt: Date | string | null;
  readonly createdByUserId: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly metadata: unknown;
};

type PrismaAppSettingDelegate = {
  findMany(input: {
    readonly where: {
      readonly namespace: string;
      readonly key: string;
      readonly scopeType: string;
      readonly scopeId: string | null;
    };
    readonly orderBy: { readonly updatedAt: 'desc' };
  }): Promise<readonly PrismaAppSettingRecord[]>;
};

export interface PrismaAppSettingClient {
  readonly appSetting: PrismaAppSettingDelegate;
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaAppSettingRecord): AppSetting {
  return Object.freeze({
    id: record.id,
    namespace: record.namespace,
    key: record.key,
    scope: Object.freeze({ type: record.scopeType, id: record.scopeId }),
    status: record.status,
    value: record.value !== null && typeof record.value === 'object' && !Array.isArray(record.value) ? toReadonlyJsonObject(record.value) : record.value,
    startsAt: nullableIso(record.startsAt),
    endsAt: nullableIso(record.endsAt),
    createdByUserId: record.createdByUserId,
    updatedByUserId: record.updatedByUserId,
    createdAt: toDomainIso(record.createdAt),
    updatedAt: toDomainIso(record.updatedAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaAppSettingRepository implements AppSettingRepository {
  constructor(private readonly client: PrismaAppSettingClient) {}

  async findByIdentity(input: Parameters<AppSettingRepository['findByIdentity']>[0]): Promise<readonly AppSetting[]> {
    const records = await this.client.appSetting.findMany({
      where: {
        namespace: input.namespace,
        key: input.key,
        scopeType: input.scope.type,
        scopeId: input.scope.id,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return Object.freeze(records.map(toDomain));
  }
}
