"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useSnackbar } from "@/contexts/SnackbarContext";
import { WS_API_URL } from "@/lib/api/base";

// ─── Event shapes (mirrors backend/app/services/notification_bus.py payloads) ─

export type BmNotification =
  | { type: "email_opened"; context: "negotiation"; prospect_id: string; prospect_nom: string }
  | { type: "email_opened"; context: "contract"; contract_id: string; prospect_id: string; prospect_nom: string }
  | { type: "email_opened"; context: "outreach"; prospect_id: string; prospect_nom: string }
  | { type: "outreach_reply"; prospect_id: string; prospect_nom: string }
  | { type: "negotiation_reply"; prospect_id: string; prospect_nom: string }
  | { type: "contract_reply"; contract_id: string; prospect_id: string; prospect_nom: string | null }
  | { type: "contract_signed"; contract_id: string; prospect_id: string; prospect_nom: string }
  | { type: "contract_declined"; contract_id: string; prospect_id: string; prospect_nom: string }
  | { type: "contract_bab_signed"; contract_id: string; prospect_id: string; prospect_nom: string }
  | { type: "contract_signature_expired"; contract_id: string; prospect_id: string; prospect_nom: string }
  | { type: "email_bounced"; prospect_id: string; prospect_nom: string };

type NotificationHandler = (event: BmNotification) => void;

interface NotificationsContextValue {
  /** Register a listener for live backend events. Returns an unsubscribe function. */
  subscribe: (handler: NotificationHandler) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function messageFor(event: BmNotification): string {
  switch (event.type) {
    case "email_opened":
      return `${event.prospect_nom} a ouvert votre email.`;
    case "outreach_reply":
      return `${event.prospect_nom} a répondu — déplacé en Négociation.`;
    case "negotiation_reply":
      return `Nouvelle réponse de ${event.prospect_nom} en négociation.`;
    case "contract_reply":
      return `${event.prospect_nom ?? "Le partenaire"} a répondu au contrat.`;
    case "contract_signed":
      return `Contrat signé — ${event.prospect_nom} est maintenant partenaire actif !`;
    case "contract_declined":
      return `Contrat refusé par ${event.prospect_nom}.`;
    case "contract_bab_signed":
      return `Vous avez signé — en attente de la signature de ${event.prospect_nom}.`;
    case "contract_signature_expired":
      return `Délai de signature expiré pour ${event.prospect_nom}.`;
    case "email_bounced":
      return `Email invalide — l'adresse de ${event.prospect_nom} a rebondi.`;
    default:
      return "Nouvel événement.";
  }
}

const RECONNECT_DELAY_MS = 4000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { showSnackbar } = useSnackbar();
  const handlersRef = useRef<Set<NotificationHandler>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSnackbarRef = useRef(showSnackbar);
  showSnackbarRef.current = showSnackbar;

  const subscribe = useCallback((handler: NotificationHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const socket = new WebSocket(`${WS_API_URL}/ws/notifications?token=${encodeURIComponent(token as string)}`);
      wsRef.current = socket;

      socket.onmessage = (raw) => {
        let event: BmNotification;
        try {
          event = JSON.parse(raw.data);
        } catch {
          return;
        }
        showSnackbarRef.current({ message: messageFor(event), severity: "info", duration: 6000 });
        handlersRef.current.forEach((handler) => handler(event));
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]);

  return (
    <NotificationsContext.Provider value={{ subscribe }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used inside <NotificationsProvider>.");
  }
  return ctx;
}
