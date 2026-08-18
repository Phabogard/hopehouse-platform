export type UniqueId = string;

export interface Entity {
  readonly id: UniqueId;
}

export abstract class BaseEntity implements Entity {
  protected constructor(public readonly id: UniqueId) {}
}
