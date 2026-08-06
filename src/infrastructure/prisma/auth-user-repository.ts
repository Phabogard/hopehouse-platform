import type { AuthUserRepository } from '../../modules/auth-security/repositories.js';
import type { AuthenticatedUser } from '../../modules/auth-security/types.js';

type PrismaAuthUserRecord = {
  readonly id: string;
  readonly email: string;
  readonly status: AuthenticatedUser['status'];
  readonly roleId: string;
};

type PrismaAuthUserDelegate = {
  findUnique(input: { readonly where: { readonly email: string } }): Promise<PrismaAuthUserRecord | null>;
};

export interface PrismaAuthUserClient {
  readonly user: PrismaAuthUserDelegate;
}

function toDomain(record: PrismaAuthUserRecord): AuthenticatedUser {
  return Object.freeze({
    id: record.id,
    identifier: record.email,
    status: record.status,
    metadata: Object.freeze({
      // Phase 1C compatibility: roleId is the persisted technical identifier.
      // AuthRuntimeContext still expects metadata.role until dynamic RBAC replaces
      // the transitional static role mapping.
      role: record.roleId,
    }),
  });
}

export class PrismaAuthUserRepository implements AuthUserRepository {
  constructor(private readonly client: PrismaAuthUserClient) {}

  async findByIdentifier(identifier: string): Promise<AuthenticatedUser | null> {
    const user = await this.client.user.findUnique({ where: { email: identifier } });
    return user === null ? null : toDomain(user);
  }
}
