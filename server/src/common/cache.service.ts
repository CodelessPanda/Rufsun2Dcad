import { Injectable } from "@nestjs/common";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CacheService {
  private readonly memory = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.memory.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
  }

  provider() {
    return process.env.REDIS_URL ? "redis-ready-memory-fallback" : "memory";
  }
}
