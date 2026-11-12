import { useEffect, useRef, useState } from "react";
import { useResource } from "../lib/hooks";
import { t } from "../i18n/core";
import { ErrorMessage } from "./ui";
let library;
let initializedClient;
let receiver;
function loadGoogle() {
  if (window.google?.accounts?.id)
    return Promise.resolve(window.google.accounts.id);
  if (!library)
    library = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () =>
        window.google?.accounts?.id
          ? resolve(window.google.accounts.id)
          : reject(
              new Error(
                "Google sign-in could not load. Please retry or use your existing sign-in method.",
              ),
            );
      script.onerror = () => {
        library = null;
        script.remove();
        reject(
          new Error(
            "Google sign-in could not load. Please retry or use your existing sign-in method.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return library;
}
export function GoogleSignIn({ onCredential, label = "Or sign in with Google" }) {
  const resource = useResource("/auth/capabilities", { publicRead: true }),
    container = useRef(null),
    callback = useRef(onCredential),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  callback.current = onCredential;
  const clientId = resource.data?.googleClientId,
    enabled = Boolean(resource.data?.google && clientId);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const receive = async (response) => {
      if (!active) return;
      setError("");
      setBusy(true);
      try {
        await callback.current(response.credential);
      } catch (e) {
        if (active) setError(e);
      } finally {
        if (active) setBusy(false);
      }
    };
    loadGoogle()
      .then((gis) => {
        if (!active || !container.current) return;
        receiver = receive;
        if (initializedClient !== clientId) {
          gis.initialize({
            client_id: clientId,
            callback: (r) => receiver?.(r),
            auto_select: false,
            ux_mode: "popup",
          });
          initializedClient = clientId;
        }
        gis.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 280,
        });
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
      if (receiver === receive) receiver = null;
    };
  }, [enabled, clientId]);
  if (!enabled) return null;
  return (
    <div className="google-signin">
      <p className="google-signin-divider"><span>{t(label)}</span></p>
      <div className="google-signin-button" ref={container} aria-label={t(label)} />
      {busy && <p className="small-print" role="status">{t("Signing in with Google…")}</p>}
      <ErrorMessage message={error} />
    </div>
  );
}
