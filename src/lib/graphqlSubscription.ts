import { createClient, type Client } from "graphql-ws";

export interface SubscriptionCallbacks {
  onMessage: (data: unknown) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onConnected?: () => void;
}

/**
 * Convert HTTP URL to WebSocket URL for GraphQL subscriptions.
 * http:// → ws://, https:// → wss://
 */
function toWebSocketUrl(url: string): string {
  return url
    .replace(/^https:\/\//i, "wss://")
    .replace(/^http:\/\//i, "ws://");
}

/**
 * Manages GraphQL subscription connections using the graphql-ws protocol.
 *
 * Requirements 5.1, 5.5, 5.6
 */
export class GraphQLSubscriptionManager {
  private client: Client | null = null;
  private unsubscribeFn: (() => void) | null = null;
  private _connected = false;

  connect(
    url: string,
    query: string,
    variables: Record<string, unknown>,
    callbacks: SubscriptionCallbacks
  ): void {
    // Disconnect any existing connection first
    this.disconnect();

    const wsUrl = toWebSocketUrl(url);

    this.client = createClient({
      url: wsUrl,
      connectionParams: {},
      on: {
        connected: () => {
          this._connected = true;
          callbacks.onConnected?.();
        },
        closed: () => {
          if (this._connected) {
            // Unexpected closure — notify user
            this._connected = false;
            callbacks.onError(new Error("Connection lost"));
          }
        },
        error: (err) => {
          this._connected = false;
          callbacks.onError(
            err instanceof Error
              ? err
              : new Error(`Connection failed: ${String(err)}`)
          );
        },
      },
    });

    this.unsubscribeFn = this.client.subscribe(
      { query, variables },
      {
        next: (value) => {
          callbacks.onMessage(value.data);
        },
        error: (err) => {
          this._connected = false;
          callbacks.onError(
            err instanceof Error
              ? err
              : new Error(`Subscription error: ${String(err)}`)
          );
        },
        complete: () => {
          this._connected = false;
          callbacks.onComplete();
        },
      }
    );
  }

  disconnect(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }
}
