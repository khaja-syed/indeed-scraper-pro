import { Actor } from 'apify';

const STORE_NAME = 'INDEED_SEEN_IDS';
const KEY = 'seen';

interface SeenState {
  ids: Record<string, { hash: string; firstSeen: string; lastSeen: string }>;
}

export class SeenStore {
  private state: SeenState = { ids: {} };
  private store: Awaited<ReturnType<typeof Actor.openKeyValueStore>> | null = null;

  async init(): Promise<void> {
    this.store = await Actor.openKeyValueStore(STORE_NAME);
    const existing = await this.store.getValue<SeenState>(KEY);
    if (existing && typeof existing === 'object') this.state = existing;
  }

  has(id: string): boolean {
    return id in this.state.ids;
  }

  changed(id: string, hash: string): boolean {
    const entry = this.state.ids[id];
    return !entry || entry.hash !== hash;
  }

  mark(id: string, hash: string): void {
    const now = new Date().toISOString();
    const entry = this.state.ids[id];
    this.state.ids[id] = entry
      ? { hash, firstSeen: entry.firstSeen, lastSeen: now }
      : { hash, firstSeen: now, lastSeen: now };
  }

  async flush(): Promise<void> {
    if (!this.store) return;
    await this.store.setValue(KEY, this.state);
  }
}
