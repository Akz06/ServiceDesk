import type { Notification, NotificationChannel } from '../src/types';
import { query } from './db';

interface NotificationRow {
  id: string;
  work_item_id: string | null;
  customer_id: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
  status: Notification['status'];
  provider: string;
  created_at: string;
}

interface NotificationRequest {
  workItemId: string | null;
  customerId: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
}

interface NotificationProvider {
  send(request: NotificationRequest): Promise<{ status: Notification['status']; provider: string }>;
}

/**
 * No SMS/WhatsApp/email account is wired up yet — this logs the message as "sent" so the rest of
 * the app (customer timeline, notification log) behaves exactly like it will once a real provider
 * (Twilio, etc.) is dropped in behind this same interface.
 */
class MockNotificationProvider implements NotificationProvider {
  async send(): Promise<{ status: Notification['status']; provider: string }> {
    return { status: 'sent', provider: 'mock' };
  }
}

const activeProvider: NotificationProvider = new MockNotificationProvider();

export function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    customerId: row.customer_id,
    channel: row.channel,
    recipient: row.recipient,
    message: row.message,
    status: row.status,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

export async function listNotifications(): Promise<Notification[]> {
  const result = await query<NotificationRow>('SELECT * FROM notifications ORDER BY id DESC');
  return result.rows.map(mapNotification);
}

let notificationSequence = 0;

export async function sendNotification(request: NotificationRequest, stamp: string): Promise<Notification> {
  const outcome = await activeProvider.send(request);
  notificationSequence += 1;
  const id = `NOTE-${Date.now()}-${notificationSequence}`;

  await query(
    `INSERT INTO notifications (id, work_item_id, customer_id, channel, recipient, message, status, provider, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, request.workItemId, request.customerId, request.channel, request.recipient, request.message, outcome.status, outcome.provider, stamp],
  );

  return {
    id,
    workItemId: request.workItemId,
    customerId: request.customerId,
    channel: request.channel,
    recipient: request.recipient,
    message: request.message,
    status: outcome.status,
    provider: outcome.provider,
    createdAt: stamp,
  };
}
