export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    search: "Search",
    loading: "Loading...",
    create: "Create",
    edit: "Edit",
    close: "Close",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    submit: "Submit",
    error: "An error occurred",
    retry: "Retry",
    empty: "No items",
  },
  navigation: {
    inbox: "Inbox",
    contacts: "Contacts",
    flows: "Flows",
    automations: "Automations",
    broadcasts: "Broadcasts",
    settings: "Settings",
    pipelines: "Pipelines",
  },
  settings: {
    title: "Settings",
    subtitle:
      "Manage your profile, WhatsApp® integration, message templates, and tags.",
    language: "Language",
    english: "English",
    french: "French",
    profile: "Profile",
    members: "Members",
    deals: "Deals",
    tags: "Tags",
    templates: "Templates",
    customFields: "Custom Fields",
    appearance: "Appearance",
    whatsapp: "WhatsApp",
    whatsappConfig: "WhatsApp Config",
  },
  inbox: {
    title: "Inbox",
    noConversation: "Select a conversation",
    noConversations: "No conversations yet",
    sessionExpired: "Your WhatsApp session has expired. Reconnect to continue.",
    replyPlaceholder: "Type a message...",
    send: "Send",
  },
  flows: {
    title: "Flows",
    createFlow: "Create flow",
    noFlows: "No flows yet",
    editor: {
      addNode: "Add node",
      start: "Start",
      end: "End",
      sendMessage: "Send message",
      sendMedia: "Send media",
      collectInput: "Collect input",
      setTag: "Set tag",
      condition: "Condition",
    },
  },
} as const;

export type Dictionary = {
  [K in keyof typeof en]: (typeof en)[K] extends Record<string, unknown>
    ? DictionarySection<(typeof en)[K]>
    : string;
};

type DictionarySection<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? DictionarySection<T[K]>
    : string;
};
