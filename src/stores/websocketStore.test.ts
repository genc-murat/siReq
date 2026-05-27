import { describe, it, expect, beforeEach } from "vitest";
import { useWebSocketStore } from "./websocketStore";
import type { WsMessageEvent } from "@/lib/invoke";

describe("websocketStore", () => {
  beforeEach(() => {
    useWebSocketStore.setState({
      connectionId: null,
      status: "disconnected",
      url: "wss://echo.websocket.org",
      messages: [],
    });
  });

  // ── Initial state ───────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts disconnected with default URL and no messages", () => {
      const s = useWebSocketStore.getState();
      expect(s.connectionId).toBeNull();
      expect(s.status).toBe("disconnected");
      expect(s.url).toBe("wss://echo.websocket.org");
      expect(s.messages).toEqual([]);
    });
  });

  // ── setConnectionId ─────────────────────────────────────────────────

  describe("setConnectionId", () => {
    it("updates connectionId to a new value", () => {
      useWebSocketStore.getState().setConnectionId("conn-1");
      expect(useWebSocketStore.getState().connectionId).toBe("conn-1");
    });

    it("clears connectionId when passed null", () => {
      useWebSocketStore.getState().setConnectionId("conn-1");
      useWebSocketStore.getState().setConnectionId(null);
      expect(useWebSocketStore.getState().connectionId).toBeNull();
    });

    it("does not affect other state fields", () => {
      useWebSocketStore.getState().setConnectionId("conn-2");
      const s = useWebSocketStore.getState();
      expect(s.status).toBe("disconnected");
      expect(s.url).toBe("wss://echo.websocket.org");
      expect(s.messages).toEqual([]);
    });
  });

  // ── setStatus ─────────────────────────────────────────────────────

  describe("setStatus", () => {
    it("sets status to connecting", () => {
      useWebSocketStore.getState().setStatus("connecting");
      expect(useWebSocketStore.getState().status).toBe("connecting");
    });

    it("sets status to connected", () => {
      useWebSocketStore.getState().setStatus("connected");
      expect(useWebSocketStore.getState().status).toBe("connected");
    });

    it("sets status back to disconnected", () => {
      useWebSocketStore.getState().setStatus("connected");
      useWebSocketStore.getState().setStatus("disconnected");
      expect(useWebSocketStore.getState().status).toBe("disconnected");
    });
  });

  // ── setUrl ────────────────────────────────────────────────────────

  describe("setUrl", () => {
    it("updates the URL", () => {
      useWebSocketStore.getState().setUrl("wss://example.com/ws");
      expect(useWebSocketStore.getState().url).toBe("wss://example.com/ws");
    });

    it("accepts empty string URL", () => {
      useWebSocketStore.getState().setUrl("");
      expect(useWebSocketStore.getState().url).toBe("");
    });
  });

  // ── addMessage ─────────────────────────────────────────────────────

  describe("addMessage", () => {
    const sentEvent: WsMessageEvent = {
      connection_id: "conn-1",
      direction: "sent",
      data: "Hello",
      is_binary: false,
    };

    const receivedEvent: WsMessageEvent = {
      connection_id: "conn-1",
      direction: "received",
      data: '{"msg":"pong"}',
      is_binary: false,
    };

    const systemEvent: WsMessageEvent = {
      connection_id: "conn-1",
      direction: "system",
      data: "Connected successfully",
      is_binary: false,
    };

    it("adds a sent message with correct fields", () => {
      useWebSocketStore.getState().addMessage(sentEvent);
      const messages = useWebSocketStore.getState().messages;

      expect(messages).toHaveLength(1);
      expect(messages[0].direction).toBe("sent");
      expect(messages[0].data).toBe("Hello");
      expect(messages[0].is_binary).toBe(false);
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].timestamp).toBeTruthy();
    });

    it("adds a received message", () => {
      useWebSocketStore.getState().addMessage(receivedEvent);
      expect(useWebSocketStore.getState().messages[0].direction).toBe("received");
      expect(useWebSocketStore.getState().messages[0].data).toBe('{"msg":"pong"}');
    });

    it("adds a system message", () => {
      useWebSocketStore.getState().addMessage(systemEvent);
      expect(useWebSocketStore.getState().messages[0].direction).toBe("system");
      expect(useWebSocketStore.getState().messages[0].data).toBe("Connected successfully");
    });

    it("appends multiple messages in order", () => {
      useWebSocketStore.getState().addMessage(sentEvent);
      useWebSocketStore.getState().addMessage(receivedEvent);
      useWebSocketStore.getState().addMessage(systemEvent);

      const messages = useWebSocketStore.getState().messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].data).toBe("Hello");
      expect(messages[1].data).toBe('{"msg":"pong"}');
      expect(messages[2].data).toBe("Connected successfully");
    });

    it("generates a unique id per message", () => {
      useWebSocketStore.getState().addMessage(sentEvent);
      useWebSocketStore.getState().addMessage(receivedEvent);

      const messages = useWebSocketStore.getState().messages;
      expect(messages[0].id).not.toBe(messages[1].id);
    });

    it("handles binary message", () => {
      const binaryEvent: WsMessageEvent = {
        connection_id: "conn-1",
        direction: "received",
        data: "base64...",
        is_binary: true,
      };
      useWebSocketStore.getState().addMessage(binaryEvent);
      expect(useWebSocketStore.getState().messages[0].is_binary).toBe(true);
    });

    it("handles empty data string", () => {
      const emptyEvent: WsMessageEvent = {
        connection_id: "conn-1",
        direction: "received",
        data: "",
        is_binary: false,
      };
      useWebSocketStore.getState().addMessage(emptyEvent);
      expect(useWebSocketStore.getState().messages[0].data).toBe("");
    });

    it("sets a timestamp on each entry", () => {
      useWebSocketStore.getState().addMessage(sentEvent);
      expect(useWebSocketStore.getState().messages[0].timestamp).toBeTruthy();
    });
  });

  // ── clearMessages ──────────────────────────────────────────────────

  describe("clearMessages", () => {
    it("removes all messages from the array", () => {
      useWebSocketStore.getState().addMessage({
        connection_id: "conn-1",
        direction: "sent",
        data: "ping",
        is_binary: false,
      });
      useWebSocketStore.getState().clearMessages();

      expect(useWebSocketStore.getState().messages).toEqual([]);
    });

    it("does not affect other state fields", () => {
      useWebSocketStore.getState().setConnectionId("conn-1");
      useWebSocketStore.getState().setStatus("connected");
      useWebSocketStore.getState().addMessage({
        connection_id: "conn-1",
        direction: "sent",
        data: "ping",
        is_binary: false,
      });
      useWebSocketStore.getState().clearMessages();

      const s = useWebSocketStore.getState();
      expect(s.connectionId).toBe("conn-1");
      expect(s.status).toBe("connected");
      expect(s.messages).toEqual([]);
    });

    it("works when messages array is already empty", () => {
      useWebSocketStore.getState().clearMessages();
      expect(useWebSocketStore.getState().messages).toEqual([]);
    });
  });

  // ── reset ─────────────────────────────────────────────────────────

  describe("reset", () => {
    it("restores initial state after modifications", () => {
      useWebSocketStore.getState().setConnectionId("conn-1");
      useWebSocketStore.getState().setStatus("connected");
      useWebSocketStore.getState().setUrl("wss://custom.com");
      useWebSocketStore.getState().addMessage({
        connection_id: "conn-1",
        direction: "sent",
        data: "test",
        is_binary: false,
      });

      useWebSocketStore.getState().reset();

      const s = useWebSocketStore.getState();
      expect(s.connectionId).toBeNull();
      expect(s.status).toBe("disconnected");
      expect(s.messages).toEqual([]);
      // reset does NOT change url back to default
      expect(s.url).toBe("wss://custom.com");
    });

    it("clears messages", () => {
      useWebSocketStore.getState().addMessage({
        connection_id: "conn-1",
        direction: "sent",
        data: "test",
        is_binary: false,
      });
      useWebSocketStore.getState().reset();
      expect(useWebSocketStore.getState().messages).toEqual([]);
    });

    it("resets connectionId to null", () => {
      useWebSocketStore.getState().setConnectionId("conn-1");
      useWebSocketStore.getState().reset();
      expect(useWebSocketStore.getState().connectionId).toBeNull();
    });

    it("resets status to disconnected", () => {
      useWebSocketStore.getState().setStatus("connected");
      useWebSocketStore.getState().reset();
      expect(useWebSocketStore.getState().status).toBe("disconnected");
    });
  });

  // ── Full lifecycle integration ─────────────────────────────────────

  describe("lifecycle integration", () => {
    it("simulates a full connect → message exchange → disconnect cycle", () => {
      const store = useWebSocketStore.getState();

      // Start disconnected
      expect(store.status).toBe("disconnected");
      expect(store.connectionId).toBeNull();

      // Connecting
      store.setStatus("connecting");
      expect(useWebSocketStore.getState().status).toBe("connecting");

      // Connected
      store.setConnectionId("ws-1");
      store.setStatus("connected");
      let s = useWebSocketStore.getState();
      expect(s.status).toBe("connected");
      expect(s.connectionId).toBe("ws-1");

      // Send a message
      store.addMessage({
        connection_id: "ws-1",
        direction: "sent",
        data: "Hello server",
        is_binary: false,
      });

      // Receive response
      store.addMessage({
        connection_id: "ws-1",
        direction: "received",
        data: "Hello client",
        is_binary: false,
      });

      // System event
      store.addMessage({
        connection_id: "ws-1",
        direction: "system",
        data: "Ping interval: 30s",
        is_binary: false,
      });

      s = useWebSocketStore.getState();
      expect(s.messages).toHaveLength(3);
      expect(s.messages[0].direction).toBe("sent");
      expect(s.messages[1].direction).toBe("received");
      expect(s.messages[2].direction).toBe("system");

      // Disconnect
      store.setStatus("disconnected");
      store.setConnectionId(null);
      s = useWebSocketStore.getState();
      expect(s.status).toBe("disconnected");
      expect(s.connectionId).toBeNull();

      // Messages persist after disconnect (clearMessages is explicit)
      expect(s.messages).toHaveLength(3);
    });
  });
});
