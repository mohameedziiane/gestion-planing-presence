"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { API_BASE_URL, ApiError, apiFetch } from "@/lib/api";
import { getStoredUser, type StoredUser } from "@/lib/auth";

type FloatingMessagesProps = {
  role: "admin" | "directeur" | "employe";
  user?: StoredUser | null;
};

type ConversationRow = {
  conversation_id?: number | null;
  group_id?: number;
  employe_id?: number;
  is_group?: boolean;
  nom_complet?: string;
  prenom?: string;
  nom?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

type ActiveConversation = {
  id: number;
  isGroup?: boolean;
  employe_id?: number;
  nom_complet: string;
};

type MessageRow = {
  id: number;
  conversation_id: number;
  is_group_message?: boolean;
  sender_user_id: number;
  contenu: string;
  message_type?: "text" | "image" | "file" | string;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  lu?: number | boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  isPending?: boolean;
};

function getConversationName(conversation: ConversationRow) {
  const directName = String(conversation.nom_complet || "").trim();

  if (directName) {
    return directName;
  }

  return [conversation.prenom, conversation.nom].filter(Boolean).join(" ").trim();
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "M";
}

function getLastMessageTimeValue(conversation: ConversationRow) {
  if (!conversation.last_message_at) {
    return null;
  }

  const time = new Date(conversation.last_message_at).getTime();

  return Number.isNaN(time) ? null : time;
}

function formatMessageTime(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (isToday) {
    return `Aujourd'hui ${time}`;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ChatIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.8 8.8 0 0 1-4-.9L3 20l1.2-4A8.3 8.3 0 0 1 3 11.5 8.7 8.7 0 0 1 12 3a8.7 8.7 0 0 1 9 8.5Z" />
      <path d="M8 11h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

function isMessageRead(message: MessageRow) {
  return message.lu === true || message.lu === 1;
}

function formatUnreadCount(count: number) {
  if (count > 99) {
    return "99+";
  }

  return String(count);
}

function resolveMessageFileUrl(fileUrl: string | null | undefined) {
  if (!fileUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  return `${API_BASE_URL}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

function canEditOrDeleteMessage(message: MessageRow, currentUserId: unknown) {
  if (
    message.is_group_message ||
    message.isPending ||
    message.deleted_at ||
    Number(message.sender_user_id) !== Number(currentUserId)
  ) {
    return false;
  }

  const createdAt = new Date(message.created_at || "").getTime();

  return Boolean(createdAt) && Date.now() - createdAt <= 60 * 60 * 1000;
}

function canDeleteGroupMessage(message: MessageRow, role: string) {
  return role === "admin" && Boolean(message.is_group_message) && !message.deleted_at;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Impossible de lire le fichier."));
    };

    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.readAsDataURL(file);
  });
}

function getReadIndicator(message: MessageRow) {
  if (message.isPending) {
    return "✓";
  }

  return "✓✓";
}

export default function FloatingMessages({ role, user }: FloatingMessagesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<ActiveConversation | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [openMessageMenuId, setOpenMessageMenuId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const currentUser = user || getStoredUser();

  const isManager = role === "admin" || role === "directeur";
  const showList = !activeConversation;

  const sortedConversations = useMemo(
    () => {
      const groupRows = conversations.filter((conversation) => conversation.is_group);
      const directRows = conversations.filter((conversation) => !conversation.is_group);

      return [
        ...groupRows,
        ...directRows.sort((first, second) => {
        const firstTime = getLastMessageTimeValue(first);
        const secondTime = getLastMessageTimeValue(second);

        if (firstTime !== null && secondTime !== null) {
          return secondTime - firstTime;
        }

        if (firstTime !== null) {
          return -1;
        }

        if (secondTime !== null) {
          return 1;
        }

        return getConversationName(first).localeCompare(getConversationName(second), "fr", {
          sensitivity: "base",
        });
        }),
      ];
    },
    [conversations]
  );

  async function loadUnreadCount() {
    try {
      const response = await apiFetch<{ unread_count?: number }>(
        "/api/messages/unread-count"
      );

      setUnreadCount(Number(response.unread_count || 0));
    } catch {
      setUnreadCount(0);
    }
  }

  async function loadConversations(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsLoading(true);
    }

    setErrorMessage("");

    try {
      const rows = await apiFetch<ConversationRow[]>("/api/messages/conversations");
      setConversations(Array.isArray(rows) ? rows : []);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les messages."
      );
      return [];
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }

  async function createConversation(employeId?: number) {
    const payload = employeId ? { employe_id: employeId } : {};
    const response = await apiFetch<{
      conversation?: { id?: number; employe_id?: number; nom_complet?: string };
    }>("/api/messages/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response.conversation?.id) {
      throw new Error("Conversation introuvable.");
    }

    return {
      id: response.conversation.id,
      employe_id: response.conversation.employe_id,
      nom_complet: response.conversation.nom_complet || "Conversation",
    };
  }

  async function markConversationAsRead(conversationId: number) {
    await apiFetch(`/api/messages/conversations/${conversationId}/read`, {
      method: "PATCH",
    });

    setMessages((current) =>
      current.map((message) =>
        Number(message.sender_user_id) === Number(currentUser?.id)
          ? message
          : { ...message, lu: true }
      )
    );
    await loadUnreadCount();
    void loadConversations({ silent: true });
  }

  async function loadMessages(
    conversation: ActiveConversation,
    options: { silent?: boolean; markAsRead?: boolean } = {}
  ) {
    if (!options.silent) {
      setIsLoading(true);
    }

    setErrorMessage("");

    try {
      const response = await apiFetch<{
        conversation?: {
          id?: number;
          employe_id?: number;
          is_group?: boolean;
          nom_complet?: string;
        };
        messages?: MessageRow[];
      }>(
        conversation.isGroup
          ? "/api/messages/group/messages"
          : `/api/messages/conversations/${conversation.id}/messages`
      );

      setActiveConversation({
        ...conversation,
        isGroup: Boolean(response.conversation?.is_group || conversation.isGroup),
        nom_complet:
          response.conversation?.nom_complet ||
          conversation.nom_complet ||
          "Conversation",
      });
      setMessages(Array.isArray(response.messages) ? response.messages : []);

      if (!conversation.isGroup && options.markAsRead !== false) {
        void markConversationAsRead(conversation.id).catch(() => undefined);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger la conversation."
      );
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }

  async function openEmployeeConversation() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const conversation = await createConversation();
      await loadMessages(conversation);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'ouvrir la conversation."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleOpen() {
    const nextOpen = !isOpen;

    if (!nextOpen) {
      setIsOpen(false);
      setActiveConversation(null);
      setMessages([]);
      setDraft("");
      return;
    }

    setIsOpen(nextOpen);

    await loadConversations();
  }

  async function handleSelectConversation(conversation: ConversationRow) {
    if (conversation.is_group) {
      await loadMessages({
        id: conversation.group_id || 0,
        isGroup: true,
        nom_complet: getConversationName(conversation) || "Tous les employés",
      });
      return;
    }

    const employeId = conversation.employe_id;

    if (!employeId) {
      setErrorMessage("Employé introuvable.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const active = conversation.conversation_id
        ? {
            id: conversation.conversation_id,
            employe_id: employeId,
            nom_complet: getConversationName(conversation),
          }
        : await createConversation(employeId);

      await loadMessages(active);
      await loadConversations();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'ouvrir la conversation."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeConversation || !draft.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage("");

    const pendingMessage: MessageRow = {
      id: -Date.now(),
      conversation_id: activeConversation.id,
      sender_user_id: Number(currentUser?.id || 0),
      contenu: draft.trim(),
      lu: false,
      created_at: new Date().toISOString(),
      isPending: true,
    };

    try {
      setMessages((current) => [...current, pendingMessage]);
      setDraft("");

      const response = await apiFetch<{ data?: MessageRow }>(
        activeConversation.isGroup
          ? "/api/messages/group/messages"
          : `/api/messages/conversations/${activeConversation.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ contenu: pendingMessage.contenu }),
        }
      );

      if (response.data) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingMessage.id ? (response.data as MessageRow) : message
          )
        );
      } else if (activeConversation.isGroup) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingMessage.id
              ? { ...pendingMessage, isPending: false, lu: true }
              : message
          )
        );
      } else {
        await loadMessages(activeConversation);
      }

      if (!activeConversation.isGroup) {
        await loadMessages(activeConversation, { silent: true, markAsRead: false });
      }

      void loadConversations({ silent: true });
      void loadUnreadCount();
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== pendingMessage.id)
      );
      setDraft(pendingMessage.contenu);
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible d'envoyer le message."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function sendAttachment(file: File) {
    if (!activeConversation || activeConversation.isGroup) {
      setErrorMessage("Les pièces jointes sont disponibles dans une conversation individuelle.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage("Le fichier ne doit pas dépasser 8 Mo.");
      return;
    }

    setIsSending(true);
    setErrorMessage("");

    try {
      const fileData = await readFileAsDataUrl(file);
      const response = await apiFetch<{ data?: MessageRow }>(
        `/api/messages/conversations/${activeConversation.id}/attachments`,
        {
          method: "POST",
          body: JSON.stringify({
            fileData,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
          }),
        }
      );

      if (response.data) {
        setMessages((current) => [...current, response.data as MessageRow]);
      } else {
        await loadMessages(activeConversation, { silent: true, markAsRead: false });
      }

      void loadConversations({ silent: true });
      void loadUnreadCount();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible d'envoyer le fichier."
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    void sendAttachment(file);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingMessageId || !editingDraft.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage("");

    try {
      const response = await apiFetch<{ data?: MessageRow }>(
        `/api/messages/messages/${editingMessageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ contenu: editingDraft.trim() }),
        }
      );

      if (response.data) {
        setMessages((current) =>
          current.map((message) =>
            message.id === editingMessageId ? (response.data as MessageRow) : message
          )
        );
      }

      setEditingMessageId(null);
      setEditingDraft("");
      setOpenMessageMenuId(null);
      void loadConversations({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de modifier le message."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteMessage(messageId: number) {
    setIsSending(true);
    setErrorMessage("");

    try {
      const response = await apiFetch<{ data?: MessageRow }>(
        `/api/messages/messages/${messageId}`,
        { method: "DELETE" }
      );

      if (response.data) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? (response.data as MessageRow) : message
          )
        );
      }

      setOpenMessageMenuId(null);
      void loadConversations({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de supprimer le message."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteGroupMessage(messageId: number) {
    setIsSending(true);
    setErrorMessage("");

    try {
      const response = await apiFetch<{ data?: MessageRow }>(
        `/api/messages/group/messages/${messageId}`,
        { method: "DELETE" }
      );

      if (response.data) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? (response.data as MessageRow) : message
          )
        );
      }

      setOpenMessageMenuId(null);
      void loadConversations({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de supprimer le message."
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleBackToList() {
    setActiveConversation(null);
    setMessages([]);
    void loadConversations();
    void loadUnreadCount();
  }

  function handleClosePanel() {
    setIsOpen(false);
    setActiveConversation(null);
    setMessages([]);
    setDraft("");
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleMessagePointerDown(message: MessageRow, canManageMessage: boolean) {
    if (
      !canManageMessage ||
      (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches)
    ) {
      return;
    }

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setOpenMessageMenuId(message.id);
      longPressTimerRef.current = null;
    }, 550);
  }

  useEffect(() => {
    if (!isOpen || !panelRef.current) {
      return;
    }

    panelRef.current.focus();
  }, [isOpen, activeConversation]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  useEffect(() => {
    void loadUnreadCount();

    const intervalId = window.setInterval(() => {
      void loadUnreadCount();

      if (isOpen && isManager && !activeConversation) {
        void loadConversations({ silent: true });
      }

      if (isOpen && activeConversation && !activeConversation.isGroup) {
        void loadMessages(activeConversation, {
          silent: true,
          markAsRead: true,
        });
      }
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeConversation, isManager, isOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="Ouvrir les messages"
        onClick={() => void handleToggleOpen()}
        className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent)] text-white shadow-lg shadow-black/20 transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35"
      >
        <ChatIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-danger-text)] px-1.5 text-[10px] font-bold leading-none text-white">
            {formatUnreadCount(unreadCount)}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          className="fixed inset-x-3 bottom-20 z-[70] flex h-[min(640px,calc(100dvh-104px))] flex-col overflow-hidden rounded-[28px] border border-white/20 bg-white text-slate-900 shadow-2xl shadow-black/35 outline-none sm:inset-x-auto sm:bottom-24 sm:right-5 sm:w-[390px]"
        >
          <div className="flex min-h-[72px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-950">
                {activeConversation ? activeConversation.nom_complet : "Messages"}
              </p>
              <p className="text-xs font-medium text-slate-500">
                {showList ? "Employés" : "Conversation"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showList ? null : (
                <button
                  type="button"
                  onClick={handleBackToList}
                  aria-label="Retour aux messages"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                >
                  <BackIcon />
                </button>
              )}
              <button
                type="button"
                aria-label="Fermer les messages"
                onClick={handleClosePanel}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </p>
          ) : null}

          {showList ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-white">
              {isLoading ? (
                <p className="px-4 py-5 text-sm text-slate-500">
                  Chargement...
                </p>
              ) : sortedConversations.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">
                  Aucun employé
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedConversations.map((conversation) => {
                    const name = getConversationName(conversation) || "Employé";
                    const lastMessage = conversation.last_message || "Aucun message";
                    const lastTime = formatMessageTime(conversation.last_message_at);

                    return (
                      <button
                        key={
                          conversation.is_group
                            ? `group-${conversation.group_id || "general"}`
                            : conversation.employe_id
                        }
                        type="button"
                        onClick={() => void handleSelectConversation(conversation)}
                        className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-600">
                          {getInitial(name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-950">
                            {name}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {lastMessage}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-2">
                          {lastTime ? (
                            <span className="whitespace-nowrap text-[10px] font-semibold text-slate-400">
                              {lastTime}
                            </span>
                          ) : null}
                          {Number(conversation.unread_count || 0) > 0 ? (
                            <span className="min-w-5 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                              {conversation.unread_count}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-100 px-4 py-4">
                {isLoading ? (
                  <p className="text-sm text-slate-500">Chargement...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun message</p>
                ) : (
                  messages.map((message) => {
                    const isMine = Number(message.sender_user_id) === Number(currentUser?.id);
                    const checks = getReadIndicator(message);
                    const canManageMessage =
                      canEditOrDeleteMessage(message, currentUser?.id) ||
                      canDeleteGroupMessage(message, role);
                    const fileUrl = resolveMessageFileUrl(message.file_url);
                    const messageType = message.message_type || "text";
                    const isMediaMessage =
                      !message.deleted_at &&
                      fileUrl &&
                      messageType !== "text";
                    const bubbleClass = isMediaMessage
                      ? "max-w-[78%] rounded-2xl bg-transparent text-slate-800"
                      : `max-w-[78%] px-3.5 py-2.5 shadow-sm ${
                          isMine
                            ? "rounded-2xl rounded-br-md bg-[var(--color-accent)] text-white"
                            : "rounded-2xl rounded-bl-md bg-white text-slate-800"
                        }`;

                    return (
                      <div
                        key={message.id}
                        className={`group/row flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          onPointerDown={() =>
                            handleMessagePointerDown(message, canManageMessage)
                          }
                          onPointerUp={clearLongPressTimer}
                          onPointerLeave={clearLongPressTimer}
                          onPointerCancel={clearLongPressTimer}
                          className={`group relative text-sm ${bubbleClass}`}
                        >
                          {canManageMessage ? (
                            <button
                              type="button"
                              aria-label="Options du message"
                              onClick={() =>
                                setOpenMessageMenuId((current) =>
                                  current === message.id ? null : message.id
                                )
                              }
                              className={`absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full text-[10px] opacity-0 transition group-hover/row:opacity-100 md:flex ${
                                isMine
                                  ? "bg-white/20 text-white hover:bg-white/30"
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                              }`}
                            >
                              ˅
                            </button>
                          ) : null}

                          {openMessageMenuId === message.id && canManageMessage ? (
                            <div
                              className={`absolute top-7 z-10 w-32 overflow-hidden rounded-lg bg-white text-sm text-slate-700 shadow-xl ${
                                isMine ? "right-0" : "left-0"
                              }`}
                            >
                              {messageType === "text" && !message.is_group_message ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(message.id);
                                    setEditingDraft(message.contenu);
                                    setOpenMessageMenuId(null);
                                  }}
                                  className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                                >
                                  Modifier
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  void (message.is_group_message
                                    ? handleDeleteGroupMessage(message.id)
                                    : handleDeleteMessage(message.id))
                                }
                                className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                              >
                                Supprimer
                              </button>
                            </div>
                          ) : null}

                          {message.deleted_at ? (
                            <p className="italic opacity-80">Message supprimé</p>
                          ) : editingMessageId === message.id ? (
                            <form onSubmit={handleEditSubmit} className="space-y-2">
                              <textarea
                                value={editingDraft}
                                onChange={(event) => setEditingDraft(event.target.value)}
                                className="min-h-20 w-full resize-none rounded-xl bg-white/95 px-3 py-2 text-sm text-slate-900 outline-none"
                              />
                              <span className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditingDraft("");
                                  }}
                                  className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold"
                                >
                                  Annuler
                                </button>
                                <button
                                  type="submit"
                                  disabled={isSending || !editingDraft.trim()}
                                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900 disabled:opacity-50"
                                >
                                  Enregistrer
                                </button>
                              </span>
                            </form>
                          ) : messageType === "image" && fileUrl ? (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-2xl bg-white p-1 shadow-sm"
                            >
                              <img
                                src={fileUrl}
                                alt={message.file_name || "Image"}
                                className="max-h-60 rounded-xl object-contain"
                              />
                            </a>
                          ) : messageType !== "text" && fileUrl ? (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-slate-800 shadow-sm"
                            >
                              <PaperclipIcon />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold">
                                  {message.file_name || "Fichier"}
                                </span>
                                {message.file_size ? (
                                  <span className="block text-xs opacity-75">
                                    {Math.ceil(Number(message.file_size) / 1024)} Ko
                                  </span>
                                ) : null}
                              </span>
                            </a>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{message.contenu}</p>
                          )}
                          <p
                            className={`mt-1 flex items-center gap-1 text-[10px] ${
                              isMine && !isMediaMessage
                                ? "justify-end text-white/80"
                                : "justify-end text-slate-400"
                            }`}
                          >
                            <span>{formatMessageTime(message.created_at)}</span>
                            {isMine ? (
                              <span
                                className={
                                  isMessageRead(message)
                                    ? "font-bold text-emerald-200"
                                    : "font-bold text-gray-200"
                                }
                                aria-label={
                                  message.isPending
                                    ? "Message en cours d'envoi"
                                    : isMessageRead(message)
                                      ? "Message lu"
                                      : "Message envoyé"
                                }
                              >
                                {checks}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {activeConversation?.isGroup && role !== "admin" ? (
                <p className="border-t border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-500">
                  Seul l'administrateur peut envoyer des messages dans ce groupe.
                </p>
              ) : (
              <form
                onSubmit={handleSendMessage}
                className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
              >
                {!activeConversation?.isGroup ? (
                  <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  aria-label="Joindre un fichier"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                >
                  <PaperclipIcon />
                </button>
                  </>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Écrire un message…"
                  rows={1}
                  className="max-h-24 min-h-11 flex-1 resize-none rounded-full bg-slate-100 px-4 py-2 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-[var(--color-accent)]/25"
                />
                <button
                  type="submit"
                  aria-label="Envoyer"
                  disabled={isSending || !draft.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SendIcon />
                </button>
              </form>
              )}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
