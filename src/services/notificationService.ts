import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '../config/supabase';

export type QueueNotificationEventType =
  | 'BOOKING_CONFIRMED'
  | 'TOKEN_CALLED'
  | 'TABLE_REDIRECTED'
  | 'SERVICE_PROCESSING'
  | 'SERVICE_COMPLETED'
  | 'TOKEN_SKIPPED'
  | 'TOKEN_CANCELLED'
  | 'TOKEN_REBOOKED'
  | 'COUNTER_ADVANCED'
  | 'OFFICE_CLOSURE_ALERT';

export interface SendNotificationOptions {
  userId: string;
  tokenId?: string;
  tokenNumber: string;
  serviceName?: string;
  counterNumber?: string;
  nextCounter?: string;
  eventType: QueueNotificationEventType;
  title: string;
  body: string;
  metadata?: Record<string, string>;
}

// In-memory token store with persistent JSON fallback
interface TokenRegistry {
  [userId: string]: {
    tokens: string[];
    updatedAt: string;
  };
}

class NotificationService {
  private static instance: NotificationService;
  private isFirebaseInitialized = false;
  private tokenStorePath: string;
  private memoryRegistry: TokenRegistry = {};
  private recentDispatches: Map<string, number> = new Map(); // Idempotency cache (key -> timestamp)

  private constructor() {
    this.tokenStorePath = path.resolve(__dirname, '../../data/fcm_tokens.json');
    this.initStorage();
    this.initFirebase();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private initStorage(): void {
    try {
      const dataDir = path.dirname(this.tokenStorePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(this.tokenStorePath)) {
        const raw = fs.readFileSync(this.tokenStorePath, 'utf-8');
        this.memoryRegistry = JSON.parse(raw);
      } else {
        this.memoryRegistry = {};
        fs.writeFileSync(this.tokenStorePath, JSON.stringify(this.memoryRegistry, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('[NotificationService] Storage init warning:', err);
    }
  }

  private saveRegistry(): void {
    try {
      fs.writeFileSync(this.tokenStorePath, JSON.stringify(this.memoryRegistry, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[NotificationService] Failed to save token registry:', err);
    }
  }

  private initFirebase(): void {
    if (admin.apps.length > 0) {
      this.isFirebaseInitialized = true;
      return;
    }

    try {
      // Look for the service account file in standard project locations
      const possiblePaths = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.resolve(__dirname, '../../../../nagrikq-firebase-adminsdk-fbsvc-cc952a0b52.json'),
        path.resolve(__dirname, '../../../nagrikq-firebase-adminsdk-fbsvc-cc952a0b52.json'),
        path.resolve(__dirname, '../../nagrikq-firebase-adminsdk-fbsvc-cc952a0b52.json'),
        path.resolve(process.cwd(), '../nagrikq-firebase-adminsdk-fbsvc-cc952a0b52.json'),
        path.resolve(process.cwd(), 'nagrikq-firebase-adminsdk-fbsvc-cc952a0b52.json'),
      ].filter(Boolean) as string[];

      let serviceAccountPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceAccountPath = p;
          break;
        }
      }

      if (serviceAccountPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.isFirebaseInitialized = true;
        console.log(`🔥 [NotificationService] Firebase Admin SDK initialized from: ${serviceAccountPath}`);
      } else {
        console.warn('⚠️ [NotificationService] Firebase service account JSON not found. Push notifications will log locally.');
      }
    } catch (err) {
      console.error('❌ [NotificationService] Firebase Admin SDK initialization error:', err);
    }
  }

  /**
   * Register or update an FCM token for an authenticated user.
   * Supports multiple devices per user and subscribes to user-specific topic.
   */
  public async registerDeviceToken(userId: string, fcmToken: string, deviceInfo?: string): Promise<void> {
    if (!userId || !fcmToken) return;

    try {
      // 1. Update local registry
      if (!this.memoryRegistry[userId]) {
        this.memoryRegistry[userId] = { tokens: [], updatedAt: new Date().toISOString() };
      }

      if (!this.memoryRegistry[userId].tokens.includes(fcmToken)) {
        this.memoryRegistry[userId].tokens.push(fcmToken);
        this.memoryRegistry[userId].updatedAt = new Date().toISOString();
        this.saveRegistry();
      }

      // 2. Subscribe token to the user's specific topic
      if (this.isFirebaseInitialized) {
        try {
          const userTopic = `user_${userId.replace(/[^a-zA-Z0-9-_.~%]/g, '_')}`;
          await admin.messaging().subscribeToTopic([fcmToken], userTopic);
          await admin.messaging().subscribeToTopic([fcmToken], 'citizens_all');
          console.log(`📡 [NotificationService] Subscribed token to topic ${userTopic}`);
        } catch (subErr) {
          console.warn('[NotificationService] Topic subscription warning:', subErr);
        }
      }

      // 3. Sync to Supabase auth user metadata for persistent multi-instance backup
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userData?.user) {
          const existingMetaTokens = Array.isArray(userData.user.user_metadata?.fcm_tokens)
            ? (userData.user.user_metadata.fcm_tokens as string[])
            : [];

          if (!existingMetaTokens.includes(fcmToken)) {
            const updatedTokens = [...existingMetaTokens, fcmToken];
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: {
                ...userData.user.user_metadata,
                fcm_tokens: updatedTokens,
                last_device_info: deviceInfo || 'mobile',
              },
            });
          }
        }
      } catch (metaErr) {
        // Non-blocking metadata sync
      }

      console.log(`✅ [NotificationService] Registered device token for user ${userId} (${deviceInfo || 'device'})`);
    } catch (err) {
      console.warn('[NotificationService] Register device token error:', err);
    }
  }

  /**
   * Remove invalid or expired token reported by FCM
   */
  public async removeDeviceToken(fcmToken: string): Promise<void> {
    try {
      let modified = false;
      for (const userId of Object.keys(this.memoryRegistry)) {
        const idx = this.memoryRegistry[userId].tokens.indexOf(fcmToken);
        if (idx !== -1) {
          this.memoryRegistry[userId].tokens.splice(idx, 1);
          modified = true;
          console.log(`🗑️ [NotificationService] Removed stale device token from user ${userId}`);
        }
      }
      if (modified) {
        this.saveRegistry();
      }
    } catch (err) {
      console.warn('[NotificationService] Remove token error:', err);
    }
  }

  /**
   * Get all registered active tokens for a user
   */
  public async getUserTokens(userId: string): Promise<string[]> {
    const tokens = new Set<string>();

    // 1. From local registry
    if (this.memoryRegistry[userId]?.tokens) {
      for (const t of this.memoryRegistry[userId].tokens) {
        if (t && typeof t === 'string' && t.trim().length > 10) {
          tokens.add(t.trim());
        }
      }
    }

    // 2. From Supabase Auth user metadata
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const metaTokens = userData?.user?.user_metadata?.fcm_tokens;
      if (Array.isArray(metaTokens)) {
        for (const t of metaTokens) {
          if (t && typeof t === 'string' && t.trim().length > 10) {
            tokens.add(t.trim());
          }
        }
      }
    } catch (_) {}

    return Array.from(tokens);
  }

  /**
   * Primary method to send an authoritative real-time push notification for queue & booking events.
   * Completely safe and non-blocking: Never throws an unhandled exception to callers.
   */
  public async sendQueuePushNotification(options: SendNotificationOptions): Promise<boolean> {
    const {
      userId,
      tokenId,
      tokenNumber,
      serviceName,
      counterNumber,
      nextCounter,
      eventType,
      title,
      body,
      metadata = {},
    } = options;

    if (!userId) {
      console.warn('[NotificationService] Cannot send notification: missing userId');
      return false;
    }

    // 1. Deduplication / Idempotency Check (prevent duplicate alerts within 15 seconds)
    const idempotencyKey = `${userId}_${tokenId || 'notoken'}_${eventType}_${counterNumber || nextCounter || ''}`;
    const now = Date.now();
    const lastSent = this.recentDispatches.get(idempotencyKey);
    if (lastSent && now - lastSent < 15000) {
      console.log(`⏩ [NotificationService] Deduplicating event: ${idempotencyKey} (sent ${now - lastSent}ms ago)`);
      return true;
    }
    this.recentDispatches.set(idempotencyKey, now);

    // Prune idempotency cache periodically
    if (this.recentDispatches.size > 500) {
      for (const [k, timestamp] of this.recentDispatches.entries()) {
        if (now - timestamp > 60000) this.recentDispatches.delete(k);
      }
    }

    // 2. Persist notification to Supabase database (notifications table)
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        title,
        message: body,
        type: 'queue',
        link_url: '/user/queue',
      });
      console.log(`📝 [NotificationService] Saved notification record in DB for user ${userId}: "${title}"`);
    } catch (dbErr) {
      console.warn('[NotificationService] Database notification insert note:', dbErr);
    }

    // 3. Dispatch Push Notification via Firebase Cloud Messaging
    if (!this.isFirebaseInitialized) {
      console.log(`📢 [LOCAL ALERT DISPATCHED - FCM Not Init]:\nTo User: ${userId}\nTitle: ${title}\nBody: ${body}`);
      return true;
    }

    try {
      const tokens = await this.getUserTokens(userId);
      const userTopic = `user_${userId.replace(/[^a-zA-Z0-9-_.~%]/g, '_')}`;

      const dataPayload: Record<string, string> = {
        title,
        body,
        eventType,
        tokenNumber: tokenNumber || '',
        serviceName: serviceName || '',
        counterNumber: counterNumber || '',
        nextCounter: nextCounter || '',
        tokenId: tokenId || '',
        userId,
        route: '/user/queue',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        timestamp: new Date().toISOString(),
        ...metadata,
      };

      let sentCount = 0;

      // Method A: Direct Multicast to all registered tokens for this user
      if (tokens.length > 0) {
        try {
          const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
              title,
              body,
            },
            data: dataPayload,
            android: {
              priority: 'high',
              notification: {
                channelId: 'nagrikq_queue_alerts_v2',
                sound: 'default',
                icon: '@mipmap/launcher_icon',
                clickAction: 'FLUTTER_NOTIFICATION_CLICK',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                  contentAvailable: true,
                },
              },
            },
          });

          sentCount += response.successCount;
          console.log(`📲 [NotificationService] FCM Multicast to ${tokens.length} tokens: ${response.successCount} succeeded, ${response.failureCount} failed`);

          // Remove invalid / unregistered tokens if any failed
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error) {
                const code = resp.error.code;
                if (
                  code === 'messaging/registration-token-not-registered' ||
                  code === 'messaging/invalid-registration-token' ||
                  code === 'messaging/invalid-argument'
                ) {
                  this.removeDeviceToken(tokens[idx]);
                }
              }
            });
          }
        } catch (multicastErr) {
          console.warn('[NotificationService] Multicast send error:', multicastErr);
        }
      }

      // Method B: Dispatch to user's personalized topic (guarantees delivery across background & terminated states)
      try {
        await admin.messaging().send({
          topic: userTopic,
          notification: {
            title,
            body,
          },
          data: dataPayload,
          android: {
            priority: 'high',
            notification: {
              channelId: 'nagrikq_queue_alerts_v2',
              sound: 'default',
              icon: '@mipmap/launcher_icon',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
                contentAvailable: true,
              },
            },
          },
        });
        console.log(`📡 [NotificationService] FCM Topic message sent to ${userTopic}: "${title}"`);
        sentCount++;
      } catch (topicErr) {
        console.warn(`[NotificationService] Topic send warning (${userTopic}):`, topicErr);
      }

      return sentCount > 0;
    } catch (fcmErr) {
      console.error('❌ [NotificationService] Push delivery error:', fcmErr);
      return false;
    }
  }
}

export const notificationService = NotificationService.getInstance();
