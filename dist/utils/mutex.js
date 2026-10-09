"use strict";
/**
 * In-memory concurrency mutex queue to serialize critical transactional operations
 * (e.g., booking slot capacity checks and stop-booking operations) per service & slot.
 * Ensures zero race conditions and zero overbooking even under high concurrency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingMutex = exports.KeyedMutex = void 0;
class KeyedMutex {
    queues = new Map();
    lockedKeys = new Set();
    async acquire(key) {
        if (!this.lockedKeys.has(key)) {
            this.lockedKeys.add(key);
            return () => this.release(key);
        }
        return new Promise((resolve) => {
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
    release(key) {
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
    async runExclusive(key, task) {
        const release = await this.acquire(key);
        try {
            return await task();
        }
        finally {
            release();
        }
    }
}
exports.KeyedMutex = KeyedMutex;
exports.bookingMutex = new KeyedMutex();
