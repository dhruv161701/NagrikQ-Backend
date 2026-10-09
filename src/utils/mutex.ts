/**
 * In-memory concurrency mutex queue to serialize critical transactional operations
 * (e.g., booking slot capacity checks and stop-booking operations) per service & slot.
 * Ensures zero race conditions and zero overbooking even under high concurrency.
 */

type AsyncRelease = () => void;

export class KeyedMutex {
  private queues: Map<string, Array<() => void>> = new Map();
  private lockedKeys: Set<string> = new Set();

  public async acquire(key: string): Promise<AsyncRelease> {
    if (!this.lockedKeys.has(key)) {
      this.lockedKeys.add(key);
      return () => this.release(key);
    }

    return new Promise<AsyncRelease>((resolve) => {
      let queue = this.queues.get(key);
      if (!queue) {
        queue = [];
        this.queues.set(key, queue);
      }

      queue.push(() => {
        resolve(() => this.release(key));
      });
    });
  }

  private release(key: string): void {
    const queue = this.queues.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next) {
        next();
        return;
      }
    }

    this.lockedKeys.delete(key);
    this.queues.delete(key);
  }

  public async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(key);
    try {
      return await task();
    } finally {
      release();
    }
  }
}

export const bookingMutex = new KeyedMutex();
