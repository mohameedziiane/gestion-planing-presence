"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

type NotificationRow = {
  id: number;
  type: string;
  titre: string;
  message: string;
  lu: boolean | number;
  created_at?: string;
};

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function isRead(notification: NotificationRow) {
  return notification.lu === true || notification.lu === 1;
}

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function formatNotificationTime(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !isRead(notification)).length,
    [notifications]
  );

  async function loadNotifications(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsLoading(true);
    }

    try {
      const payload = await apiFetch<{
        notifications?: NotificationRow[];
        unread_count?: number;
      }>("/api/notifications");

      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch {
      setNotifications([]);
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }

  async function handleNotificationClick(notification: NotificationRow) {
    if (!isRead(notification)) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, lu: true } : item
        )
      );

      await apiFetch(`/api/notifications/${notification.id}/read`, {
        method: "PATCH",
      }).catch(() => undefined);
    }
  }

  useEffect(() => {
    void loadNotifications({ silent: true });

    const intervalId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadNotifications({ silent: true });

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-bold text-white">
            {formatBadgeCount(unreadCount)}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-[80] w-[min(340px,calc(100vw-24px))] pt-2">
          <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/30">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Notifications
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <p className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
                  Chargement...
                </p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
                  Aucune notification
                </p>
              ) : (
                notifications.map((notification) => {
                  const read = isRead(notification);

                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className={`w-full border-b border-[var(--color-border)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[var(--color-surface-muted)] ${
                        read ? "bg-[var(--color-surface)]" : "bg-[var(--color-action-primary-bg)]"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-[var(--color-text)]">
                        {notification.titre}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">
                        {notification.message}
                      </span>
                      <span className="mt-2 block text-[10px] font-semibold text-[var(--color-text-muted)]">
                        {formatNotificationTime(notification.created_at)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
