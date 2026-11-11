import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useResource } from "../lib/hooks";
import { safeReturnTo } from "../lib/continuation";
import { GoogleSignIn } from "../components/GoogleSignIn";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import {
  Button,
  ErrorMessage,
  Field,
  Notice,
  PageHeading,
  Spinner,
} from "../components/ui";

export function PasswordHelp() {
  useLanguage();
  const [params] = useSearchParams();
  const [action] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)),
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const resource = useResource("/auth/capabilities"),
    token = action.get("token"),
    verify = action.get("kind") === "verify";
  return (
    <div className="container page narrow">
      <PageHeading
        title={t(
          verify
            ? "Confirm your email."
            : token
              ? "Choose a fresh password."
              : "A little help signing in.",
        )}
      />
      <ErrorMessage message={error} />
      {resource.data?.google && !token && (
        <p className="small-print">
          {t(
            "If you sign in through Google, your Google password is managed by Google. An app-password reset does not reset your Google password.",
          )}
        </p>
      )}
      {success ? (
        <Notice>{success}</Notice>
      ) : token ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (!verify && password !== confirmation)
                throw new Error(t("The passwords do not match."));
              await api(verify ? "/auth/verify" : "/auth/reset", {
                method: "POST",
                auth: false,
                body: verify ? { token } : { token, password },
              });
              setSuccess(
                t(
                  verify
                    ? "Email verified. You can return to your account."
                    : "Your password has been changed. All previous sessions are invalid. Sign in again with your new password.",
                ),
              );
              setPassword("");
              setConfirmation("");
              window.history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search,
              );
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {!verify && (
            <>
              <Field
                label={t("New password")}
                name="reset-password"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                label={t("Confirm password")}
                name="reset-confirm"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <p className="small-print">
                {t(
                  "At least 12 characters; no more than 72 UTF-8 bytes. Password reset ends all existing sessions.",
                )}
              </p>
            </>
          )}
          <Button className="button" busy={busy}>
            {t(verify ? "Verify email" : "Reset password")}
          </Button>
        </form>
      ) : resource.loading ? (
        <Spinner />
      ) : resource.data?.passwordRecovery ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const { data } = await api("/auth/recovery", {
                method: "POST",
                auth: false,
                body: { email },
              });
              setSuccess(data.message);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label={t("Email address")}
            name="recovery-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button className="button" busy={busy}>
            {t("Request a secure reset link")}
          </Button>
        </form>
      ) : (
        <section className="panel">
          <Notice>
            {t(
              "Email password recovery is not configured for this atelier yet. Contact the atelier for a secure account recovery process. Your existing drafts remain saved.",
            )}
          </Notice>
          <Link className="button secondary" to="/contact">
            {t("Contact the atelier")}
          </Link>
          <ErrorMessage message={resource.error} retry={resource.reload} />
        </section>
      )}
      <Link
        className="text-link"
        to={`/login?returnTo=${encodeURIComponent(safeReturnTo(params.get("returnTo")))}`}
      >
        {t("Return to sign in")}
      </Link>
    </div>
  );
}
export function AccountSecurity() {
  useLanguage();
  const { profile, logout } = useAuth(),
    identity = useResource("/account/identity"),
    capabilities = useResource("/auth/capabilities");
  const [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [linkPassword, setLinkPassword] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading title={t("Your account, thoughtfully protected.")} />
      <ErrorMessage message={error} />
      {success && <Notice>{success}</Notice>}
      <section className="panel">
        <h2>{t("Sign-in methods")}</h2>
        <p>{profile?.email}</p>
        <p>
          {identity.data?.methods
            ?.map((method) =>
              t(method === "google" ? "Google sign-in" : "Email and password"),
            )
            .join(" · ") || t("Checking linked sign-in methods…")}
        </p>
        <p className="small-print">
          {t(
            "Sessions expire after 30 minutes. Changing or resetting your password ends all existing sessions.",
          )}
        </p>
        <p>
          {t(
            identity.data?.emailVerified
              ? "Email verified"
              : "Email not yet verified",
          )}
        </p>
        {capabilities.data?.emailVerification &&
          !identity.data?.emailVerified && (
            <Button
              className="button secondary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { data } = await api("/auth/verification", {
                    method: "POST",
                    body: {},
                  });
                  setSuccess(data.message);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Send verification email")}
            </Button>
          )}
      </section>
      {identity.error && (
        <ErrorMessage message={identity.error} retry={identity.reload} />
      )}
      {identity.data?.methods?.includes("google") &&
        !identity.data?.methods?.includes("password") && (
          <section className="panel">
            <h2>{t("Your Google account")}</h2>
            <p>
              {t(
                "You sign in through Google. Manage your Google password and account protection through Google.",
              )}
            </p>
            <a
              className="text-link"
              href="https://myaccount.google.com/security"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Manage Google account security")}
            </a>
          </section>
        )}
      {identity.data?.methods?.includes("password") && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (password !== confirmation) {
              setError(t("The passwords do not match."));
              return;
            }
            setBusy(true);
            try {
              await api("/auth/password", {
                method: "POST",
                body: { currentPassword, password },
              });
              setCurrentPassword("");
              setPassword("");
              setConfirmation("");
              await logout();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{t("Change password")}</h2>
          <Field
            label={t("Current password")}
            name="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Field
            label={t("New password")}
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label={t("Confirm new password")}
            name="confirm-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button className="button" busy={busy}>
            {t("Change password and sign out")}
          </Button>
        </form>
      )}
      {identity.data?.methods?.includes("password") &&
        !identity.data?.methods?.includes("google") &&
        capabilities.data?.google && (
          <section className="panel">
            <h2>{t("Link Google sign-in")}</h2>
            <p>
              {t(
                "Prove control of your existing account with your current password, then choose the Google account to link. Your orders stay with this account.",
              )}
            </p>
            <Field
              label={t("Current password to authorize linking")}
              name="google-link-password"
              type="password"
              autoComplete="current-password"
              value={linkPassword}
              onChange={(e) => setLinkPassword(e.target.value)}
            />
            <GoogleSignIn
              label="Link a Google account"
              onCredential={async (credential) => {
                if (!linkPassword)
                  throw new Error(
                    t("Enter your current password before linking."),
                  );
                try {
                  await api("/auth/google/link", {
                    method: "POST",
                    body: { credential, currentPassword: linkPassword },
                  });
                  setLinkPassword("");
                  setSuccess(
                    t("Google sign-in linked to your existing account."),
                  );
                  identity.reload();
                } catch (e) {
                  setError(e);
                  throw e;
                }
              }}
            />
          </section>
        )}
      <Link className="text-link" to="/account/profile">
        {t("Manage profile or request account deletion")}
      </Link>
    </>
  );
}
