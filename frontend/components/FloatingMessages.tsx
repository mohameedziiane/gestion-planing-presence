"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { getStoredUser, type StoredUser } from "@/lib/auth";

type FloatingMessagesProps = {
  role: "admin" | "employe";
  user?: StoredUser | null;
};

type ConversationRow = {
  conversation_id?: number | null;
  employe_id?: number;
  nom_complet?: string;
  prenom?: string;
  nom?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

type ActiveConversation = {
  id: number;
  employe_id?: number;
  nom_complet: string;
};

type MessageRow = {
  id: number;
  conversation_id: number;
  sender_user_id: number;
  contenu: string;
  lu?: number | boolean;
  created_at?: string;
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

function isMessageRead(message: MessageRow) {
  return message.lu === true || message.lu === 1;
}

function formatUnreadCount(count: number) {
  if (count > 99) {
    return "99+";
  }

  return String(count);
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
  const [errorMessage, setErrorMessage] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const currentUser = user || getStoredUser();

  const isAdmin = role === "admin";
  const showList = isAdmin && !activeConversation;

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((first, second) => {
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
        conversation?: { id?: number; employe_id?: number; nom_complet?: string };
        messages?: MessageRow[];
      }>(`/api/messages/conversations/${conversation.id}/messages`);

      setActiveConversation({
        ...conversation,
        nom_complet:
          response.conversation?.nom_complet ||
          conversation.nom_complet ||
          "Conversation",
      });
      setMessages(Array.isArray(response.messages) ? response.messages : []);

      if (options.markAsRead !== false) {
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

    if (role === "employe") {
      await openEmployeeConversation();
      return;
    }

    await loadConversations();
  }

  async function handleSelectConversation(conversation: ConversationRow) {
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
        `/api/messages/conversations/${activeConversation.id}/messages`,
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
      } else {
        await loadMessages(activeConversation);
      }

      await loadMessages(activeConversation, { silent: true, markAsRead: false });
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

  useEffect(() => {
    if (!isOpen || !panelRef.current) {
      return;
    }

    panelRef.current.focus();
  }, [isOpen, activeConversation]);

  useEffect(() => {
    void loadUnreadCount();

    const intervalId = window.setInterval(() => {
      void loadUnreadCount();

      if (isOpen && isAdmin && !activeConversation) {
        void loadConversations({ silent: true });
      }

      if (isOpen && activeConversation) {
        void loadMessages(activeConversation, {
          silent: true,
          markAsRead: true,
        });
      }
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeConversation, isAdmin, isOpen]);

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
              {showList ? null : isAdmin ? (
                <button
                  type="button"
                  onClick={handleBackToList}
                  aria-label="Retour aux messages"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                >
                  <BackIcon />
                </button>
              ) : null}
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
                        key={conversation.employe_id}
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

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[78%] px-3.5 py-2.5 text-sm shadow-sm ${
                            isMine
                              ? "rounded-2xl rounded-br-md bg-[var(--color-accent)] text-white"
                              : "rounded-2xl rounded-bl-md bg-white text-slate-800"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.contenu}</p>
                          <p
                            className={`mt-1 flex items-center gap-1 text-[10px] ${
                              isMine ? "justify-end text-white/80" : "text-slate-400"
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

              <form
                onSubmit={handleSendMessage}
                className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
              >
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
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
