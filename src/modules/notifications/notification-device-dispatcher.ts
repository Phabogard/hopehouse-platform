import { createSign, randomUUID } from 'node:crypto';
import type { NotificationDeviceRecord, NotificationDeviceRegistry } from './notification-device-registry.js';
import type { NotificationTransport, SendNotificationInput, SentNotification } from './notification-transport.js';
import { NotificationDeliveryInProgressError, type NotificationDeliveryRepository } from './notification-delivery.js';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface NotificationDeviceSendInput {
  readonly device: NotificationDeviceRecord;
  readonly notification: SendNotificationInput;
}

export interface NotificationDeviceSender {
  readonly provider: string;
  send(input: NotificationDeviceSendInput): Promise<{ readonly id: string }>;
}

export interface FcmServiceAccount {
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
}

interface FcmFetchResponse {
  readonly access_token: string;
  readonly expires_in?: number;
}

interface FcmApiError {
  readonly error?: {
    readonly status?: string;
    readonly message?: string;
    readonly details?: readonly unknown[];
  };
}

export class FcmNotificationError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly providerStatus: string | undefined,
    readonly providerCode: string | undefined,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'FcmNotificationError';
  }
}

export class FcmNotificationDeviceSender implements NotificationDeviceSender {
  readonly provider = 'fcm';
  private accessToken: { readonly value: string; readonly expiresAt: number } | null = null;

  constructor(
    private readonly serviceAccount: FcmServiceAccount,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly tokenEndpoint = GOOGLE_TOKEN_ENDPOINT,
  ) {
    if (!serviceAccount.project_id.trim()) throw new Error('Firebase project_id is required');
    if (!serviceAccount.client_email.trim()) throw new Error('Firebase client_email is required');
    if (!serviceAccount.private_key.includes('PRIVATE KEY')) throw new Error('Firebase private_key is required');
  }

  static fromServiceAccountJson(
    json: string,
    fetchImpl: typeof fetch = fetch,
  ): FcmNotificationDeviceSender {
    let serviceAccount: FcmServiceAccount;
    try {
      serviceAccount = JSON.parse(json) as FcmServiceAccount;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON');
    }
    return new FcmNotificationDeviceSender(serviceAccount, fetchImpl);
  }

  async send({ device, notification }: NotificationDeviceSendInput): Promise<{ readonly id: string }> {
    const accessToken = await this.getAccessToken();
    const response = await this.fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.serviceAccount.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          message: {
            token: device.registrationToken,
            data: {
              template: notification.template,
              deduplicationKey: notification.deduplicationKey,
              payload: JSON.stringify(notification.payload),
            },
          },
        }),
      },
    );

    const body = await response.text();
    const parsed = parseJson(body);

    if (!response.ok) {
      const apiError = parsed as FcmApiError;
      const providerStatus = apiError.error?.status;
      const providerCode = extractFcmErrorCode(apiError.error?.details);
      const retryable = response.status === 429 || response.status >= 500;
      throw new FcmNotificationError(
        apiError.error?.message ?? `FCM request failed with HTTP ${response.status}`,
        response.status,
        providerStatus,
        providerCode,
        retryable,
      );
    }

    const name = typeof parsed === 'object' && parsed !== null && 'name' in parsed
      ? (parsed as { name?: unknown }).name
      : undefined;
    if (typeof name !== 'string' || !name) {
      throw new FcmNotificationError('FCM response did not contain a message name', response.status, undefined, undefined, true);
    }

    return { id: name };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken !== null && this.accessToken.expiresAt > now + 60_000) {
      return this.accessToken.value;
    }

    const issuedAt = Math.floor(now / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(JSON.stringify({
      iss: this.serviceAccount.client_email,
      scope: FCM_SCOPE,
      aud: this.tokenEndpoint,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }));
    const unsignedToken = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const assertion = `${unsignedToken}.${signer.sign(this.serviceAccount.private_key.replace(/\\\\n/g, '\\n').replace(/\\n/g, '\\n')).toString('base64url')}`;

    const response = await this.fetchImpl(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    const body = await response.text();
    const parsed = parseJson(body) as Partial<FcmFetchResponse> & { error?: string; error_description?: string };
    if (!response.ok || typeof parsed.access_token !== 'string') {
      throw new FcmNotificationError(
        parsed.error_description ?? parsed.error ?? `Google OAuth token request failed with HTTP ${response.status}`,
        response.status,
        parsed.error,
        undefined,
        response.status === 429 || response.status >= 500,
      );
    }

    const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600;
    this.accessToken = {
      value: parsed.access_token,
      expiresAt: now + Math.max(60, expiresIn - 60) * 1000,
    };
    return parsed.access_token;
  }
}

export function createFcmNotificationDeviceSenderFromEnvironment(
  fetchImpl: typeof fetch = fetch,
): FcmNotificationDeviceSender {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required when NOTIFICATION_TRANSPORT=fcm');
  }

  const sender = FcmNotificationDeviceSender.fromServiceAccountJson(raw, fetchImpl);
  const configuredProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (configuredProjectId !== undefined && configuredProjectId !== '') {
    return new FcmNotificationDeviceSender(
      { ...parseServiceAccount(raw), project_id: configuredProjectId },
      fetchImpl,
    );
  }
  return sender;
}

function parseServiceAccount(json: string): FcmServiceAccount {
  try {
    return JSON.parse(json) as FcmServiceAccount;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON');
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function parseJson(value: string): unknown {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function extractFcmErrorCode(details: readonly unknown[] | undefined): string | undefined {
  if (details === undefined) return undefined;
  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) continue;
    const value = (detail as { errorCode?: unknown }).errorCode;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

export class NotificationDeviceFanoutTransport implements NotificationTransport {
  private readonly senders: ReadonlyMap<string, NotificationDeviceSender>;

  constructor(
    private readonly registry: NotificationDeviceRegistry,
    senders: readonly NotificationDeviceSender[],
    private readonly deliveryRepository?: NotificationDeliveryRepository,
  ) {
    this.senders = new Map(senders.map((sender) => [sender.provider, sender]));
  }

  async send(input: SendNotificationInput): Promise<SentNotification> {
    const devices = await this.registry.listActive({ userId: input.recipientId });
    if (devices.length === 0) {
      throw new Error(`No active notification devices for recipient ${input.recipientId}`);
    }

    const sentResults = await Promise.all(devices.map(async (device) => {
      const sender = this.senders.get(device.provider);
      if (sender === undefined) {
        throw new Error(`No notification sender configured for provider ${device.provider}`);
      }

      if (this.deliveryRepository !== undefined) {
        const claim = await this.deliveryRepository.claim({
          id: randomUUID(),
          deduplicationKey: input.deduplicationKey,
          deviceId: device.id,
          provider: device.provider,
          now: new Date().toISOString(),
        });
        if (claim === 'sent') return { skipped: true };
        if (claim === 'sending') {
          throw new NotificationDeliveryInProgressError(input.deduplicationKey, device.id);
        }

        let result: { readonly id: string };
        try {
          result = await sender.send({ device, notification: input });
        } catch (error: unknown) {
          await this.deliveryRepository.markFailed({
            deduplicationKey: input.deduplicationKey,
            deviceId: device.id,
            error: error instanceof Error ? error.message : String(error),
            now: new Date().toISOString(),
          });
          if (
            error instanceof FcmNotificationError &&
            error.providerStatus === 'UNREGISTERED'
          ) {
            await this.registry.revoke({
              userId: device.userId,
              provider: device.provider,
              installationId: device.installationId,
            });
          }
          throw error;
        }

        await this.deliveryRepository.markSent({
          deduplicationKey: input.deduplicationKey,
          deviceId: device.id,
          providerMessageId: result.id,
          now: new Date().toISOString(),
        });
        return { skipped: false };
      }

      try {
        return { skipped: false, result: await sender.send({ device, notification: input }) };
      } catch (error: unknown) {
        if (
          error instanceof FcmNotificationError &&
          error.providerStatus === 'UNREGISTERED'
        ) {
          await this.registry.revoke({
            userId: device.userId,
            provider: device.provider,
            installationId: device.installationId,
          });
        }
        throw error;
      }
    }));

    const sentAt = new Date().toISOString();
    const deliveryCount = sentResults.filter((result) => !result.skipped).length;

    return Object.freeze({
      id: `notification:${input.deduplicationKey}`,
      recipientId: input.recipientId,
      template: input.template,
      channel: input.channel,
      payload: Object.freeze({
        ...input.payload,
        deliveryCount,
      }),
      sentAt,
    });
  }
}
