import { randomBytes } from 'crypto';

export interface StoredApproval {
  id: string;
  userId: string;
  tool: string;
  arguments: Record<string, unknown>;
  draftComment: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * In-process pending-approval store.
 * Keyed by approval id; each entry is bound to a user id so a client cannot
 * forge another user's write payload. Entries expire after 15 minutes.
 *
 * NOTE: This is process-local memory. For multi-instance production, replace
 * with a durable store (KV / Redis / D1) that shares the same contract.
 */
class ApprovalStore {
  private store = new Map<string, StoredApproval>();
  private readonly ttlMs = 15 * 60 * 1000;

  create(
    userId: string,
    tool: string,
    args: Record<string, unknown>,
    draftComment: string
  ): StoredApproval {
    this.purgeExpired();
    const id = randomBytes(24).toString('hex');
    const now = Date.now();
    const entry: StoredApproval = {
      id,
      userId,
      tool,
      arguments: { ...args },
      draftComment,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.store.set(id, entry);
    return entry;
  }

  /**
   * Consume (one-shot) an approval. Returns null if missing, expired, wrong user,
   * or already consumed. Successful consume deletes the entry (no replay).
   */
  consume(id: string, userId: string): StoredApproval | null {
    this.purgeExpired();
    const entry = this.store.get(id);
    if (!entry) return null;
    if (entry.userId !== userId) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return null;
    }
    this.store.delete(id);
    return entry;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(id);
    }
  }
}

export const approvalStore = new ApprovalStore();
