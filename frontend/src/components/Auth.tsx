import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, Sprout } from "lucide-react";
import { api } from "../lib/api";
import type { Session } from "../types";
import { Brand } from "./Brand";
import { navigate } from "../lib/navigation";

export function Auth({
  onLogin,
  notice,
  register,
}: {
  onLogin: (session: Session) => void;
  notice: string;
  register: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (register && password !== String(form.get("confirm_password"))) {
      setError(
        "Passwords don’t match. Please enter the same password in both fields.",
      );
      const confirmation =
        event.currentTarget.elements.namedItem("confirm_password");
      if (confirmation instanceof HTMLInputElement) confirmation.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (register) {
        await api.register(email, password);
        // Offer sign-in if the account was created but automatic login fails.
        navigate("login", { replace: true, search: window.location.search });
      }
      const result = await api.login(email, password);
      onLogin(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand light />
        <div className="story-copy">
          <span className="eyebrow light">
            <span className="small-line" /> A LITTLE CLARITY GOES A LONG WAY
          </span>
          <h1>
            Make room for
            <br />
            the good stuff.
          </h1>
          <p>
            Know what comes in, what goes out,
            <br className="desktop" /> and where your money can take you.
          </p>
          <div className="story-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-card">
              <span>One step at a time</span>
              <Sprout size={65} strokeWidth={1} />
              <strong>
                A little more
                <br />
                peace of mind.
              </strong>
            </div>
            <div className="art-note">
              <Check size={16} /> You’ve got this.
            </div>
          </div>
        </div>
        <p className="story-footer">Less guesswork. More living.</p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow">YOUR MONEY, MADE CLEAR</span>
          <h2>{register ? "A fresh start." : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "A simple place to keep track of your bread."
              : "Let’s see where your bread is at."}
          </p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <form autoComplete="off" onSubmit={submit}>
            <label>
              Email address
              <input
                autoComplete="off"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                maxLength={254}
                disabled={busy}
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  autoComplete="off"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 12 characters"
                  required
                  minLength={12}
                  maxLength={128}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register && (
              <label>
                Confirm password
                <div className="password-field">
                  <input
                    autoComplete="off"
                    name="confirm_password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Enter your password again"
                    required
                    minLength={12}
                    maxLength={128}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmed password"
                        : "Show confirmed password"
                    }
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy
                ? "One moment…"
                : register
                  ? "Create your account"
                  : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already keeping track?" : "New around here?"}{" "}
            <a
              className="text-button"
              href={`${register ? "/login" : "/register"}${window.location.search}`}
              aria-disabled={busy}
              onClick={(event) => {
                if (busy) {
                  event.preventDefault();
                  return;
                }
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                navigate(register ? "login" : "register", {
                  search: window.location.search,
                });
                setError("");
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </a>
          </p>
          <div className="auth-note">
            <span className="tiny-dot" /> Your own space for your pay and
            payments.
          </div>
        </div>
      </section>
    </main>
  );
}
