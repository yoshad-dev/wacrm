import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared hoisted mock state
const h = vi.hoisted(() => ({
  state: {
    contact: null as { id: string; phone: string } | null,
    contactErr: null as { message: string } | null,
    config: null as {
      phone_number_id: string;
      access_token: string;
    } | null,
    configErr: null as { message: string } | null,
    insertErr: null as { message: string } | null,
    fromCalls: [] as string[],
    updateCalls: [] as { table: string; payload: unknown }[],
    insertCalls: [] as { table: string; payload: unknown }[],
  },
}));

vi.mock("./admin-client", () => {
  const { state } = h;

  function resolve(ops: {
    table: string;
    type: string;
    payload?: unknown;
    filters: [string, string, unknown][];
  }) {
    const { table, type } = ops;
    if (table === "contacts") {
      if (type === "update") {
        state.updateCalls.push({ table, payload: ops.payload });
        return { data: null, error: null };
      }
      return { data: state.contact, error: state.contactErr };
    }
    if (table === "whatsapp_config") {
      return { data: state.config, error: state.configErr };
    }
    if (table === "messages") {
      if (type === "insert") {
        state.insertCalls.push({ table, payload: ops.payload });
        return { data: null, error: state.insertErr };
      }
      return { data: null, error: null };
    }
    if (table === "conversations") {
      if (type === "update") {
        state.updateCalls.push({ table, payload: ops.payload });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  function builder(table: string) {
    const ops = {
      table,
      type: "select",
      payload: undefined as unknown,
      filters: [] as [string, string, unknown][],
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: unknown) => ((ops.type = "insert"), (ops.payload = p), b),
      update: (p: unknown) => ((ops.type = "update"), (ops.payload = p), b),
      eq: (k: string, v: unknown) => (ops.filters.push(["eq", k, v]), b),
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve(resolve(ops)),
      maybeSingle: () => Promise.resolve(resolve(ops)),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(ops)).then(onF, onR),
    };
    return b;
  }

  return {
    supabaseAdmin: () => ({
      from: (t: string) => {
        state.fromCalls.push(t);
        return builder(t);
      },
    }),
  };
});

const mockSendTextMessage = vi.fn();
const mockSendMediaMessage = vi.fn();
const mockSendInteractiveButtons = vi.fn();
const mockSendInteractiveList = vi.fn();

vi.mock("@/lib/whatsapp/meta-api", () => ({
  sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
  sendMediaMessage: (...args: unknown[]) => mockSendMediaMessage(...args),
  sendInteractiveButtons: (...args: unknown[]) =>
    mockSendInteractiveButtons(...args),
  sendInteractiveList: (...args: unknown[]) =>
    mockSendInteractiveList(...args),
}));

vi.mock("@/lib/whatsapp/encryption", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
}));

vi.mock("@/lib/whatsapp/phone-utils", () => ({
  sanitizePhoneForMeta: (p: string) => p,
  isValidE164: (p: string) => p.startsWith("+"),
  phoneVariants: (p: string) => [p, p.replace("+", "+0")],
  isRecipientNotAllowedError: (msg: string) =>
    msg.includes("recipient_not_allowed"),
}));

import {
  engineSendText,
  engineSendMedia,
  engineSendInteractiveButtons,
  engineSendInteractiveList,
} from "./meta-send";

const ACCOUNT = "acct-1";
const USER = "u1";
const CONV = "conv-1";
const CONTACT = "c1";

beforeEach(() => {
  h.state.contact = { id: CONTACT, phone: "+1234567890" };
  h.state.contactErr = null;
  h.state.config = {
    phone_number_id: "pn1",
    access_token: "enc_token",
  };
  h.state.configErr = null;
  h.state.insertErr = null;
  h.state.fromCalls = [];
  h.state.updateCalls = [];
  h.state.insertCalls = [];
  mockSendTextMessage.mockReset();
  mockSendMediaMessage.mockReset();
  mockSendInteractiveButtons.mockReset();
  mockSendInteractiveList.mockReset();
  mockSendTextMessage.mockResolvedValue({ messageId: "wamid-text-1" });
  mockSendMediaMessage.mockResolvedValue({ messageId: "wamid-media-1" });
  mockSendInteractiveButtons.mockResolvedValue({ messageId: "wamid-btn-1" });
  mockSendInteractiveList.mockResolvedValue({ messageId: "wamid-list-1" });
});

// ============================================================
// engineSendText
// ============================================================

describe("engineSendText", () => {
  it("sends text and persists the message to DB", async () => {
    const result = await engineSendText({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      text: "Hello!",
    });

    expect(result.whatsapp_message_id).toBe("wamid-text-1");
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumberId: "pn1",
        accessToken: "decrypted:enc_token",
        to: "+1234567890",
        text: "Hello!",
      }),
    );
    expect(h.state.insertCalls).toHaveLength(1);
    expect(h.state.insertCalls[0].payload).toMatchObject({
      conversation_id: CONV,
      sender_type: "bot",
      content_type: "text",
      content_text: "Hello!",
      message_id: "wamid-text-1",
      status: "sent",
    });
  });

  it("throws when contact is not found", async () => {
    h.state.contact = null;
    await expect(
      engineSendText({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: "missing",
        text: "Hi",
      }),
    ).rejects.toThrow("contact not found");
  });

  it("throws when phone is invalid (non-E164)", async () => {
    h.state.contact = { id: CONTACT, phone: "not-e164" };
    await expect(
      engineSendText({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: CONTACT,
        text: "Hi",
      }),
    ).rejects.toThrow("contact phone invalid");
  });

  it("throws when WhatsApp is not configured", async () => {
    h.state.config = null;
    await expect(
      engineSendText({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: CONTACT,
        text: "Hi",
      }),
    ).rejects.toThrow("WhatsApp not configured");
  });

  it("retries with phone variants on recipient_not_allowed", async () => {
    mockSendTextMessage
      .mockRejectedValueOnce(new Error("recipient_not_allowed"))
      .mockResolvedValueOnce({ messageId: "wamid-text-2" });

    const result = await engineSendText({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      text: "Retry test",
    });

    expect(result.whatsapp_message_id).toBe("wamid-text-2");
    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
    // Should update contact phone to the working variant
    expect(h.state.updateCalls.some((c) => c.table === "contacts")).toBe(true);
  });

  it("rethrows non-recipient errors immediately", async () => {
    mockSendTextMessage.mockRejectedValue(new Error("network timeout"));
    await expect(
      engineSendText({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: CONTACT,
        text: "Hi",
      }),
    ).rejects.toThrow("network timeout");
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
  });

  it("throws when DB insert fails after Meta send", async () => {
    h.state.insertErr = { message: "unique violation" };
    await expect(
      engineSendText({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: CONTACT,
        text: "Hi",
      }),
    ).rejects.toThrow("DB insert failed");
  });
});

// ============================================================
// engineSendMedia
// ============================================================

describe("engineSendMedia", () => {
  it("sends image media and persists with correct content_type", async () => {
    const result = await engineSendMedia({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      kind: "image",
      link: "https://cdn.example.com/img.jpg",
      caption: "Check this out",
    });

    expect(result.whatsapp_message_id).toBe("wamid-media-1");
    expect(mockSendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "image",
        link: "https://cdn.example.com/img.jpg",
        caption: "Check this out",
      }),
    );
    expect(h.state.insertCalls[0].payload).toMatchObject({
      content_type: "image",
      content_text: "Check this out",
    });
  });

  it("uses [kind] as preview when caption is empty", async () => {
    await engineSendMedia({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      kind: "document",
      link: "https://cdn.example.com/file.pdf",
    });

    // conversation update uses the preview
    const convUpdate = h.state.updateCalls.find(
      (c) => c.table === "conversations",
    );
    expect(convUpdate?.payload).toMatchObject({
      last_message_text: "[document]",
    });
  });

  it("passes filename for documents", async () => {
    await engineSendMedia({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      kind: "document",
      link: "https://cdn.example.com/file.pdf",
      filename: "invoice.pdf",
    });

    expect(mockSendMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "invoice.pdf" }),
    );
  });

  it("retries with phone variants on recipient_not_allowed", async () => {
    mockSendMediaMessage
      .mockRejectedValueOnce(new Error("recipient_not_allowed"))
      .mockResolvedValueOnce({ messageId: "wamid-media-2" });

    const result = await engineSendMedia({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      kind: "video",
      link: "https://cdn.example.com/clip.mp4",
    });

    expect(result.whatsapp_message_id).toBe("wamid-media-2");
    expect(mockSendMediaMessage).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// engineSendInteractiveButtons
// ============================================================

describe("engineSendInteractiveButtons", () => {
  const buttons = [
    { id: "btn-yes", title: "Yes" },
    { id: "btn-no", title: "No" },
  ];

  it("sends interactive buttons and persists as interactive content_type", async () => {
    const result = await engineSendInteractiveButtons({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      bodyText: "Confirm?",
      buttons,
    });

    expect(result.whatsapp_message_id).toBe("wamid-btn-1");
    expect(mockSendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: "Confirm?",
        buttons,
      }),
    );
    expect(h.state.insertCalls[0].payload).toMatchObject({
      content_type: "interactive",
      content_text: "Confirm?",
      sender_type: "bot",
    });
  });

  it("passes header and footer when provided", async () => {
    await engineSendInteractiveButtons({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      bodyText: "Pick one",
      buttons,
      headerText: "Welcome",
      footerText: "Powered by Bot",
    });

    expect(mockSendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({
        headerText: "Welcome",
        footerText: "Powered by Bot",
      }),
    );
  });

  it("throws when contact not found", async () => {
    h.state.contact = null;
    await expect(
      engineSendInteractiveButtons({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: CONTACT,
        bodyText: "Pick",
        buttons,
      }),
    ).rejects.toThrow("contact not found");
  });

  it("retries phone variants on recipient_not_allowed", async () => {
    mockSendInteractiveButtons
      .mockRejectedValueOnce(new Error("recipient_not_allowed"))
      .mockResolvedValueOnce({ messageId: "wamid-btn-2" });

    const result = await engineSendInteractiveButtons({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      bodyText: "Try again",
      buttons,
    });

    expect(result.whatsapp_message_id).toBe("wamid-btn-2");
    expect(h.state.updateCalls.some((c) => c.table === "contacts")).toBe(true);
  });
});

// ============================================================
// engineSendInteractiveList
// ============================================================

describe("engineSendInteractiveList", () => {
  const sections = [
    {
      title: "Options",
      rows: [
        { id: "row-1", title: "Option A" },
        { id: "row-2", title: "Option B" },
      ],
    },
  ];

  it("sends interactive list and persists as interactive content_type", async () => {
    const result = await engineSendInteractiveList({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      bodyText: "Choose an option",
      buttonLabel: "View Options",
      sections,
    });

    expect(result.whatsapp_message_id).toBe("wamid-list-1");
    expect(mockSendInteractiveList).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: "Choose an option",
        buttonLabel: "View Options",
        sections,
      }),
    );
    expect(h.state.insertCalls[0].payload).toMatchObject({
      content_type: "interactive",
      content_text: "Choose an option",
    });
  });

  it("throws when WhatsApp config is missing", async () => {
    h.state.config = null;
    await expect(
      engineSendInteractiveList({
        accountId: ACCOUNT,
        userId: USER,
        conversationId: CONV,
        contactId: CONTACT,
        bodyText: "Pick",
        buttonLabel: "Show",
        sections,
      }),
    ).rejects.toThrow("WhatsApp not configured");
  });

  it("retries phone variants on recipient_not_allowed", async () => {
    mockSendInteractiveList
      .mockRejectedValueOnce(new Error("recipient_not_allowed"))
      .mockResolvedValueOnce({ messageId: "wamid-list-2" });

    const result = await engineSendInteractiveList({
      accountId: ACCOUNT,
      userId: USER,
      conversationId: CONV,
      contactId: CONTACT,
      bodyText: "Pick",
      buttonLabel: "Show",
      sections,
    });

    expect(result.whatsapp_message_id).toBe("wamid-list-2");
  });
});
