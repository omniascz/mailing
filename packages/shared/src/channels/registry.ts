import type { Channel, IChannelAdapter } from '../types/channels.js';

/**
 * Channel registry — maps channel name to its active adapter.
 *
 * Used by the queue/dispatch layer: given a UnifiedMessage, look up the
 * adapter for its channel and call send(). Provider routing (which adapter
 * for which country/operator) lives one layer up; the registry only knows
 * "channel → adapter".
 */
export class ChannelRegistry {
  private readonly adapters = new Map<Channel, IChannelAdapter>();

  register(adapter: IChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: Channel): IChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  require(channel: Channel): IChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${channel}`);
    }
    return adapter;
  }

  list(): Channel[] {
    return Array.from(this.adapters.keys());
  }
}
