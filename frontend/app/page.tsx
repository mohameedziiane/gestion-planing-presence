"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { API_BASE_URL, translateUserMessage } from "@/lib/api";
import { applyTheme, getInitialTheme } from "@/lib/theme";

type LoginUser = {
  id: number;
  email: string;
  role: "admin" | "directeur" | "employe" | string;
  employe_id: number | null;
};

type LoginResponse = {
  token?: string;
  user?: LoginUser;
  message?: string;
};

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: TurnstileRenderOptions
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const roleRedirects: Record<string, string> = {
  admin: "/admin",
  directeur: "/directeur",
  employe: "/employe",
};

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const captchaRequiredMessage = "Le captcha est obligatoire.";

function getCaptchaErrorMessage(message: string) {
  const normalizedMessage = String(message || "").trim();

  if (
    normalizedMessage === "The captcha is required." ||
    normalizedMessage === "Veuillez valider le captcha."
  ) {
    return captchaRequiredMessage;
  }

  if (normalizedMessage.toLowerCase().includes("captcha")) {
    return translateUserMessage(normalizedMessage);
  }

  return "";
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-[var(--color-text-muted)]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-[var(--color-text-muted)]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <rect width="18" height="11" x="3" y="11" rx="1" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    if (!turnstileSiteKey) {
      return;
    }

    function renderTurnstile() {
      if (
        !turnstileRef.current ||
        !window.turnstile ||
        turnstileWidgetIdRef.current
      ) {
        return;
      }

      turnstileWidgetIdRef.current = window.turnstile.render(
        turnstileRef.current,
        {
          sitekey: turnstileSiteKey,
          theme: "light",
          callback: (token) => {
            setTurnstileToken(token);
            setCaptchaError("");
          },
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        }
      );
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    const script =
      existingScript || document.createElement("script");

    script.addEventListener("load", renderTurnstile);

    if (!existingScript) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    if (window.turnstile) {
      renderTurnstile();
    }

    return () => {
      script.removeEventListener("load", renderTurnstile);

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, []);

  function resetTurnstile() {
    setTurnstileToken("");

    if (turnstileWidgetIdRef.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCaptchaError("");

    if (!turnstileToken) {
      setCaptchaError(captchaRequiredMessage);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.token || !data.user) {
        const message = data.message || "Login failed";
        const captchaMessage = getCaptchaErrorMessage(message);

        if (captchaMessage) {
          setCaptchaError(captchaMessage);
        } else {
          setError(translateUserMessage(message));
        }

        resetTurnstile();
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("keepSignedIn", String(keepSignedIn));

      router.push(roleRedirects[data.user.role] || "/");
    } catch {
      setError("Impossible de contacter le serveur backend.");
      resetTurnstile();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-[var(--color-bg)] px-4 py-8 text-[var(--color-text)]">
      <section className="relative w-[92vw] max-w-[520px] overflow-hidden rounded-none bg-[var(--color-surface)] pb-10 pt-9">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-accent)]" />

        <div className="mx-auto w-[calc(100%-48px)] max-w-[352px] sm:mx-0 sm:ml-[104px] sm:w-[352px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <Image
              src="/logo.png"
              alt="Gare Routière de Taza"
              width={86}
              height={86}
              priority
              className="mb-4 h-[78px] w-[78px] object-contain"
            />
            <h1 className="text-[22px] font-semibold leading-7 tracking-normal text-[var(--color-text)]">
              Connexion à votre espace
            </h1>
            <p className="mt-2 text-[13px] font-semibold text-[var(--color-text-muted)]">
              Gestion du Planning et de Présence
            </p>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
              Gare Routière de Taza
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-none border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger-text)]"
              >
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-[var(--color-text-muted)]"
              >
                E-Mail Address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                  <UserIcon />
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your e-mail"
                  className="h-[46px] w-full rounded-none border border-[var(--color-border)] bg-[var(--color-surface-muted)] pl-10 pr-3 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-[var(--color-text-muted)]"
              >
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-[46px] w-full rounded-none border border-[var(--color-border)] bg-[var(--color-surface-muted)] pl-10 pr-3 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 pt-1 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(event) => setKeepSignedIn(event.target.checked)}
                className="h-4 w-4 rounded-none border-[var(--color-border)] bg-[var(--color-surface-muted)] accent-[var(--color-accent)]"
              />
              Rester connecté
            </label>

            <div className="flex min-h-[65px] justify-center">
              <div ref={turnstileRef} />
            </div>

            {captchaError ? (
              <div
                role="alert"
                className="rounded-none border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-center text-sm text-[var(--color-danger-text)]"
              >
                {captchaError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-[46px] w-full items-center justify-center rounded-none bg-[var(--color-accent)] px-4 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:bg-[var(--color-accent-hover)] disabled:text-[var(--color-text)]"
            >
              {isLoading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
