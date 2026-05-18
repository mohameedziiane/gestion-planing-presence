"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { API_BASE_URL, translateUserMessage } from "@/lib/api";

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

const roleRedirects: Record<string, string> = {
  admin: "/admin",
  directeur: "/directeur",
  employe: "/employe",
};

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-[#acbdc5]"
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
      className="h-4 w-4 text-[#acbdc5]"
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
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.token || !data.user) {
        setError(translateUserMessage(data.message || "Login failed"));
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("keepSignedIn", String(keepSignedIn));

      router.push(roleRedirects[data.user.role] || "/");
    } catch {
      setError("Impossible de contacter le serveur backend.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-[#4c595f] px-4 py-8 text-[#e1e3e4]">
      <section className="relative w-[92vw] max-w-[520px] overflow-hidden rounded-none bg-[#38474e] pb-10 pt-9">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-[#1AB6FF]" />

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
            <h1 className="text-[22px] font-semibold leading-7 tracking-normal text-[#e1e3e4]">
              Connexion à votre espace
            </h1>
            <p className="mt-2 text-[13px] font-semibold text-[#acbdc5]">
              Gestion du Planning et de Présence
            </p>
            <p className="mt-1 text-[13px] text-[#acbdc5]">
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
                className="block text-sm font-semibold text-[#acbdc5]"
              >
                E-Mail Address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#acbdc5]">
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
                  className="h-[46px] w-full rounded-none border border-[rgba(172,189,197,0.18)] bg-[#34434a] pl-10 pr-3 text-sm text-[#e1e3e4] outline-none transition placeholder:text-[#acbdc5] focus:border-[#1AB6FF] focus:ring-1 focus:ring-[#1AB6FF]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-[#acbdc5]"
              >
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#acbdc5]">
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
                  className="h-[46px] w-full rounded-none border border-[rgba(172,189,197,0.18)] bg-[#34434a] pl-10 pr-3 text-sm text-[#e1e3e4] outline-none transition placeholder:text-[#acbdc5] focus:border-[#1AB6FF] focus:ring-1 focus:ring-[#1AB6FF]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 pt-1 text-sm text-[#acbdc5]">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(event) => setKeepSignedIn(event.target.checked)}
                className="h-4 w-4 rounded-none border-[rgba(172,189,197,0.18)] bg-[#34434a] accent-[#1AB6FF]"
              />
              Keep me signed in
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-[46px] w-full items-center justify-center rounded-none bg-[#1AB6FF] px-4 text-sm font-bold text-white transition hover:bg-[#169CDC] focus:outline-none focus:ring-2 focus:ring-[#1AB6FF] focus:ring-offset-2 focus:ring-offset-[#38474e] disabled:cursor-not-allowed disabled:bg-[#169CDC] disabled:text-[#e1e3e4]"
            >
              {isLoading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
