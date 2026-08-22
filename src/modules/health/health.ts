export interface HealthStatus {
  readonly status: 'ok';
  readonly service: string;
  readonly timestamp?: string;
}

export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    service: 'hopehouse-platform',
  };
}
