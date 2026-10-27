/**
 * In-memory keyed mutex to prevent race conditions across asynchronous event loop turns.
 * Serializes operations that target the same entity (e.g., user account, task claim, or clan milestone).
 */
export class KeyedMutex {
  private chains = new Map<string, Promise<any>>();

  public async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) || Promise.resolve();
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Atomically chain next holder
    this.chains.set(key, prev.catch(() => {}).then(() => gate));

    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release!();
      if (this.chains.get(key) === gate) {
        this.chains.delete(key);
      }
    }
  }
}

export const rewardMutex = new KeyedMutex();

