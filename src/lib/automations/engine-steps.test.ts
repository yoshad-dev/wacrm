import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for automations engine step execution, triggerMatches,
 * and condition evaluation — extending the existing tenant-isolation tests.
 */

const h = vi.hoisted(() => ({
  state: {
    owned: null as { id: string } | null,
    ownedCustomField: null as { id: string } | null,
    automations: [] as Record<string, unknown>[],
    steps: [] as Record<string, unknown>[],
    fromCalls: [] as string[],
    updateCalls: [] as { table: string; filters: [string, string, unknown][] }[],
    upsertCalls: [] as { table: string; payload: unknown }[],
    insertCalls: [] as { table: string; payload: unknown }[],
    deleteCalls: [] as { table: string; filters: [string, string, unknown][] }[],
    contactTagCount: 0,
    contactRow: null as Record<string, unknown> | null,
    accountRow: null as Record<string, unknown> | null,
    profileRows: [] as Record<string, unknown>[],
  },
}));

vi.mock("./admin-client", () => {
  const { state } = h;

  function resolve(ops: {
    table: string;
    type: string;
    payload?: unknown;
    filters: [string, string, unknown][];
    selectOpts?: { count?: string; head?: boolean };
  }) {
    const { table, type } = ops;
    if (table === "contacts") {
      if (type === "update") {
        state.updateCalls.push({ table, filters: ops.filters });
        return { data: null, error: null };
      }
      if (type === "select" && state.contactRow) {
        return { data: state.contactRow, error: null };
      }
      return { data: state.owned, error: null };
    }
    if (table === "custom_fields") {
      return { data: state.ownedCustomField, error: null };
    }
    if (table === "contact_custom_values") {
      if (type === "upsert") {
        state.upsertCalls.push({ table, payload: ops.payload });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    if (table === "automations") return { data: state.automations, error: null };
    if (table === "automation_logs") {
      if (type === "insert") return { data: { id: "log1" }, error: null };
      if (type === "update") return { data: null, error: null };
      return { data: { steps_executed: [], status: "success" }, error: null };
    }
    if (table === "automation_steps") return { data: state.steps, error: null };
    if (table === "contact_tags") {
      if (type === "upsert") {
        state.upsertCalls.push({ table, payload: ops.payload });
        return { data: null, error: null };
      }
      if (type === "delete") {
        state.deleteCalls.push({ table, filters: ops.filters });
        return { data: null, error: null };
      }
      // count query for condition eval
      return { data: null, error: null, count: state.contactTagCount };
    }
    if (table === "conversations") {
      if (type === "update") {
        state.updateCalls.push({ table, filters: ops.filters });
        return { data: null, error: null };
      }
      return { data: { id: "conv-1" }, error: null };
    }
    if (table === "deals") {
      if (type === "insert") {
        state.insertCalls.push({ table, payload: ops.payload });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    if (table === "accounts") {
      return { data: state.accountRow, error: null };
    }
    if (table === "profiles") {
      return { data: state.profileRows, error: null };
    }
    if (table === "automation_pending_executions") {
      if (type === "insert") {
        state.insertCalls.push({ table, payload: ops.payload });
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
      selectOpts: undefined as { count?: string; head?: boolean } | undefined,
    };
    const b: Record<string, unknown> = {
      select: (_sel?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts) ops.selectOpts = opts;
        return b;
      },
      insert: (p: unknown) => ((ops.type = "insert"), (ops.payload = p), b),
      update: (p: unknown) => ((ops.type = "update"), (ops.payload = p), b),
      delete: () => ((ops.type = "delete"), b),
      upsert: (p: unknown) => ((ops.type = "upsert"), (ops.payload = p), b),
      eq: (k: string, v: unknown) => (ops.filters.push(["eq", k, v]), b),
      gte: () => b,
      is: () => b,
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
      rpc: () => Promise.resolve({ error: null }),
    }),
  };
});

vi.mock("./meta-send", () => ({
  engineSendText: vi.fn(async () => ({ whatsapp_message_id: "m1" })),
  engineSendTemplate: vi.fn(async () => ({ whatsapp_message_id: "m1" })),
}));

// Mock global fetch for send_webhook
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { runAutomationsForTrigger } from "./engine";

const ACCOUNT = "acct-1";

beforeEach(() => {
  h.state.owned = { id: "c1" };
  h.state.ownedCustomField = null;
  h.state.automations = [];
  h.state.steps = [];
  h.state.fromCalls = [];
  h.state.updateCalls = [];
  h.state.upsertCalls = [];
  h.state.insertCalls = [];
  h.state.deleteCalls = [];
  h.state.contactTagCount = 0;
  h.state.contactRow = null;
  h.state.accountRow = null;
  h.state.profileRows = [];
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
});

// ============================================================
// triggerMatches — keyword_match filtering
// ============================================================

describe("triggerMatches — keyword_match", () => {
  it("fires when keyword contains-matches (case-insensitive)", async () => {
    h.state.automations = [
      mkAutomation("keyword_match", {
        keywords: ["hello"],
        match_type: "contains",
        case_sensitive: false,
      }),
    ];
    h.state.steps = [mkStep("close_conversation")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "keyword_match",
      contactId: "c1",
      context: { message_text: "Say HELLO world" },
    });

    expect(h.state.updateCalls.some((c) => c.table === "conversations")).toBe(
      true,
    );
  });

  it("does not fire when keyword does not match", async () => {
    h.state.automations = [
      mkAutomation("keyword_match", {
        keywords: ["bye"],
        match_type: "contains",
        case_sensitive: false,
      }),
    ];
    h.state.steps = [mkStep("close_conversation")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "keyword_match",
      contactId: "c1",
      context: { message_text: "hello there" },
    });

    expect(h.state.updateCalls).toHaveLength(0);
  });

  it("fires on exact match (case-sensitive)", async () => {
    h.state.automations = [
      mkAutomation("keyword_match", {
        keywords: ["STOP"],
        match_type: "exact",
        case_sensitive: true,
      }),
    ];
    h.state.steps = [mkStep("close_conversation")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "keyword_match",
      contactId: "c1",
      context: { message_text: "STOP" },
    });

    expect(h.state.updateCalls.some((c) => c.table === "conversations")).toBe(
      true,
    );
  });

  it("rejects exact match with different case when case_sensitive", async () => {
    h.state.automations = [
      mkAutomation("keyword_match", {
        keywords: ["STOP"],
        match_type: "exact",
        case_sensitive: true,
      }),
    ];
    h.state.steps = [mkStep("close_conversation")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "keyword_match",
      contactId: "c1",
      context: { message_text: "stop" },
    });

    expect(h.state.updateCalls).toHaveLength(0);
  });

  it("non-keyword triggers always match", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [mkStep("close_conversation")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.updateCalls.some((c) => c.table === "conversations")).toBe(
      true,
    );
  });
});

// ============================================================
// Step execution — add_tag / remove_tag
// ============================================================

describe("step: add_tag / remove_tag", () => {
  it("add_tag upserts into contact_tags", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("add_tag", { tag_id: "tag-priority" }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.upsertCalls).toHaveLength(1);
    expect(h.state.upsertCalls[0].table).toBe("contact_tags");
    expect(h.state.upsertCalls[0].payload).toEqual({
      contact_id: "c1",
      tag_id: "tag-priority",
    });
  });

  it("remove_tag deletes from contact_tags", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("remove_tag", { tag_id: "tag-old" }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.deleteCalls).toHaveLength(1);
    expect(h.state.deleteCalls[0].table).toBe("contact_tags");
    expect(h.state.deleteCalls[0].filters).toContainEqual([
      "eq",
      "contact_id",
      "c1",
    ]);
    expect(h.state.deleteCalls[0].filters).toContainEqual([
      "eq",
      "tag_id",
      "tag-old",
    ]);
  });
});

// ============================================================
// Step execution — close_conversation
// ============================================================

describe("step: close_conversation", () => {
  it("updates the conversation status to closed scoped by account", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [mkStep("close_conversation")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    const convUpdate = h.state.updateCalls.find(
      (c) => c.table === "conversations",
    );
    expect(convUpdate).toBeDefined();
    expect(convUpdate!.filters).toContainEqual([
      "eq",
      "account_id",
      ACCOUNT,
    ]);
    expect(convUpdate!.filters).toContainEqual(["eq", "contact_id", "c1"]);
  });
});

// ============================================================
// Step execution — create_deal
// ============================================================

describe("step: create_deal", () => {
  it("inserts a deal with account currency", async () => {
    h.state.accountRow = { default_currency: "EUR" };
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("create_deal", {
        pipeline_id: "pipe-1",
        stage_id: "stage-1",
        title: "New deal for {{ message.text }}",
        value: 500,
      }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: { message_text: "interested" },
    });

    expect(h.state.insertCalls.some((c) => c.table === "deals")).toBe(true);
    const dealInsert = h.state.insertCalls.find((c) => c.table === "deals");
    expect(dealInsert?.payload).toMatchObject({
      pipeline_id: "pipe-1",
      stage_id: "stage-1",
      title: "New deal for interested",
      value: 500,
      currency: "EUR",
      contact_id: "c1",
      account_id: ACCOUNT,
    });
  });

  it("defaults to USD when account has no currency", async () => {
    h.state.accountRow = null;
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("create_deal", {
        pipeline_id: "pipe-1",
        stage_id: "stage-1",
        title: "Deal",
        value: 0,
      }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    const dealInsert = h.state.insertCalls.find((c) => c.table === "deals");
    expect((dealInsert?.payload as Record<string, unknown>)?.currency).toBe(
      "USD",
    );
  });
});

// ============================================================
// Step execution — send_webhook
// ============================================================

describe("step: send_webhook", () => {
  it("sends a POST to the configured URL", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("send_webhook", {
        url: "https://hooks.example.com/notify",
        body_template: '{"msg":"{{ message.text }}"}',
      }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: { message_text: "ping" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example.com/notify",
      expect.objectContaining({
        method: "POST",
        body: '{"msg":"ping"}',
      }),
    );
  });

  it("interpolates context into the body template", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("send_webhook", {
        url: "https://hooks.example.com/x",
        body_template: "From {{ vars.source }}: {{ message.text }}",
      }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: { message_text: "hello", vars: { source: "WhatsApp" } },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example.com/x",
      expect.objectContaining({
        body: "From WhatsApp: hello",
      }),
    );
  });
});

// ============================================================
// Step execution — assign_conversation
// ============================================================

describe("step: assign_conversation", () => {
  it("assigns a specific agent to the conversation", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("assign_conversation", { agent_id: "agent-42", mode: "specific" }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    const convUpdate = h.state.updateCalls.find(
      (c) => c.table === "conversations",
    );
    expect(convUpdate).toBeDefined();
    expect(convUpdate!.filters).toContainEqual([
      "eq",
      "account_id",
      ACCOUNT,
    ]);
  });

  it("falls back to round_robin picking from profiles", async () => {
    h.state.profileRows = [{ user_id: "rr-agent" }];
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      mkStep("assign_conversation", { mode: "round_robin" }),
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.fromCalls).toContain("profiles");
  });
});

// ============================================================
// Step execution — wait (suspension)
// ============================================================

describe("step: wait", () => {
  it("parks execution into automation_pending_executions", async () => {
    h.state.automations = [mkAutomation("new_message_received", {})];
    h.state.steps = [
      {
        id: "wait-step",
        automation_id: "a1",
        step_type: "wait",
        position: 0,
        parent_step_id: null,
        step_config: { amount: 2, unit: "hours" },
      },
    ];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    const pendingInsert = h.state.insertCalls.find(
      (c) => c.table === "automation_pending_executions",
    );
    expect(pendingInsert).toBeDefined();
    expect(pendingInsert!.payload).toMatchObject({
      automation_id: "a1",
      account_id: ACCOUNT,
      contact_id: "c1",
      next_step_position: 1,
      status: "pending",
    });
  });
});

// ============================================================
// Helpers
// ============================================================

function mkAutomation(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
) {
  return {
    id: "a1",
    account_id: ACCOUNT,
    user_id: "u1",
    trigger_type: triggerType,
    trigger_config: triggerConfig,
    is_active: true,
  };
}

function mkStep(
  stepType: string,
  stepConfig: Record<string, unknown> = {},
) {
  return {
    id: `step-${stepType}`,
    automation_id: "a1",
    step_type: stepType,
    position: 0,
    parent_step_id: null,
    step_config: stepConfig,
  };
}
