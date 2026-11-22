import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageSquare,
  X,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Loader2,
  User,
  Download,
  Share2,
  Compass,
} from "lucide-react";
import { t } from "../../i18n/core";
import { useLanguage } from "../../i18n/Language";
import { api } from "../../lib/api";
import {
  getStoredChatSession,
  saveChatSession,
  clearChatSession,
  createCustomerSocket,
} from "../../lib/chat-socket";
import "./customer-chat.css";

function formatMessageTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMessageDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return t("Today");
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return t("Yesterday");
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getPageContext(location) {
  const pathname = location?.pathname || "";
  const search = location?.search || "";

  if (pathname.startsWith("/catalogue") || pathname.startsWith("/designs")) {
    return {
      title: "Catalogue & Design Help",
      prompts: [
        "Which fabric works best with this design?",
        "Can the neck and sleeves be customized?",
        "What is the estimated stitching price?",
        "Can you stitch from my own photo reference?",
      ],
    };
  }

  if (pathname.startsWith("/request")) {
    if (search.includes("measurements")) {
      return {
        title: "Stitching Request Guidance",
        prompts: [
          "How do I measure myself accurately at home?",
          "Can I send a well-fitting sample garment?",
          "Can tailor take my measurements via video call?",
          "What is the total stitching estimate?",
        ],
      };
    }
    if (search.includes("fabric") || search.includes("delivery")) {
      return {
        title: "Stitching Request Guidance",
        prompts: [
          "How does fabric doorstep pickup work?",
          "How much fabric is required for this garment?",
          "What is the delivery turnaround time?",
          "What is the total stitching estimate?",
        ],
      };
    }
    return {
      title: "Stitching Request Guidance",
      prompts: [
        "Can you help me choose the best design options?",
        "How do I provide my measurements?",
        "Can I send my own fabric for stitching?",
        "What is the total stitching estimate?",
      ],
    };
  }

  if (pathname.startsWith("/account/orders") || pathname.startsWith("/account/tracking")) {
    return {
      title: "Order Status & Delivery",
      prompts: [
        "What is the current status of my outfit?",
        "Can I update my delivery address or phone?",
        "When will my stitched order be delivered?",
        "Can I speak with the master tailor working on my dress?",
      ],
    };
  }

  if (pathname.startsWith("/how-it-works")) {
    return {
      title: "How Atelier Stitching Works",
      prompts: [
        "How does doorstep fabric pickup and delivery work?",
        "Do you provide fabric or do I send my own?",
        "What if the dress needs alteration after delivery?",
        "How do I place my first stitching request?",
      ],
    };
  }

  if (pathname.startsWith("/contact")) {
    return {
      title: "Master Tailor Support",
      prompts: [
        "I have a question about a bespoke design",
        "I need help choosing fabric for an occasion",
        "Can you duplicate a designer outfit from photo?",
        "What are your working hours and response time?",
      ],
    };
  }

  return {
    title: "Master Tailor Guidance",
    prompts: [
      "Custom Stitching Enquiry",
      "How to provide measurements?",
      "Price estimate for suit / kurti / blouse",
      "Turnaround and delivery time",
    ],
  };
}

export function CustomerChatWidget() {
  useLanguage();
  const location = useLocation();
  const pageContext = getPageContext(location);
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        window.location.pathname === "/chat" ||
        window.location.search.includes("open=chat")
      );
    }
    return false;
  });
  const [session, setSession] = useState(() => getStoredChatSession());
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  const [adminOnline, setAdminOnline] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [relatedOrderRef, setRelatedOrderRef] = useState("");
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [customerPrompts, setCustomerPrompts] = useState([
    "Custom Stitching Enquiry",
    "How to provide measurements?",
    "Price estimate for suit / kurti",
    "Turnaround and delivery time",
  ]);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const windowRef = useRef(null);
  const dragRef = useRef(null);
  const launcherRef = useRef(null);
  const composerInputRef = useRef(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Drag handler for moveable chat window
  const handleHeaderPointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("form")) return;
    if (window.innerWidth <= 640) return; // Keep fixed on mobile

    const winEl = windowRef.current;
    if (!winEl) return;

    const rect = winEl.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      width: rect.width,
      height: rect.height,
    };

    setIsDragging(true);

    const onPointerMove = (moveEvt) => {
      if (!dragRef.current) return;
      const dx = moveEvt.clientX - dragRef.current.startX;
      const dy = moveEvt.clientY - dragRef.current.startY;
      const maxX = window.innerWidth - dragRef.current.width - 10;
      const maxY = window.innerHeight - dragRef.current.height - 10;

      const nextX = Math.max(10, Math.min(maxX, dragRef.current.origX + dx));
      const nextY = Math.max(10, Math.min(maxY, dragRef.current.origY + dy));

      setPosition({ x: nextX, y: nextY });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Re-clamp position on window resize or orientationchange
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth <= 640) {
        setPosition(null);
        return;
      }
      setPosition((prev) => {
        if (!prev) return null;
        const width = windowRef.current?.offsetWidth || 380;
        const height = windowRef.current?.offsetHeight || 560;
        const maxX = window.innerWidth - width - 10;
        const maxY = window.innerHeight - height - 10;
        const nextX = Math.max(10, Math.min(maxX, prev.x));
        const nextY = Math.max(10, Math.min(maxY, prev.y));
        if (nextX === prev.x && nextY === prev.y) return prev;
        return { x: nextX, y: nextY };
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // Global Escape key listener: closes lightbox if open, otherwise closes chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (isOpen) {
          setIsOpen(false);
          launcherRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage, isOpen]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        composerInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Scroll messages to bottom smoothly
  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // Initialize or restore guest session (robust error handling: never clear on 500 or offline)
  const initSession = useCallback(async () => {
    const stored = getStoredChatSession();
    try {
      const res = await api("/chat/guest", {
        method: "POST",
        auth: false,
        body: stored
          ? { customerId: stored.customerId, guestToken: stored.guestToken }
          : {},
      });

      if (res?.data) {
        const nextSession = {
          customerId: res.data.customerId,
          guestToken: res.data.guestToken || stored?.guestToken,
          displayName: res.data.displayName || "",
          conversationId: res.data.conversationId,
        };
        saveChatSession(nextSession);
        setSession(nextSession);
        setDisplayNameInput(nextSession.displayName || "");
        return nextSession;
      }
    } catch (err) {
      const isAuthError =
        err?.status === 401 ||
        err?.code === "GUEST_SESSION_EXPIRED" ||
        err?.code === "GUEST_UNAUTHORIZED";

      if (stored && isAuthError) {
        clearChatSession();
        try {
          const freshRes = await api("/chat/guest", {
            method: "POST",
            auth: false,
            body: {},
          });
          if (freshRes?.data) {
            const freshSession = {
              customerId: freshRes.data.customerId,
              guestToken: freshRes.data.guestToken,
              displayName: "",
              conversationId: freshRes.data.conversationId,
            };
            saveChatSession(freshSession);
            setSession(freshSession);
            return freshSession;
          }
        } catch {
          // Offline retry
        }
      } else if (stored) {
        // Network drop, timeout, or 500: retain stored session so customer ID is preserved
        setSession(stored);
        return stored;
      }
    }
    return null;
  }, []);

  // Load message history from REST API
  const loadMessages = useCallback(async (activeSession) => {
    if (!activeSession?.guestToken || !activeSession?.customerId) return;
    try {
      const res = await api("/chat/messages?limit=50", {
        method: "GET",
        auth: false,
        headers: {
          "x-guest-token": activeSession.guestToken,
          "x-customer-id": activeSession.customerId,
        },
      });

      if (res?.data?.messages) {
        setMessages(res.data.messages);
        setTimeout(() => scrollToBottom("auto"), 50);
      }
    } catch {
      // Retrying silently on reconnect
    }
  }, [scrollToBottom]);

  // Mark messages as read by customer
  const markMessagesRead = useCallback(async (activeSession) => {
    if (!activeSession?.guestToken || !activeSession?.customerId) return;
    setUnreadCount(0);

    // REST mark read
    api("/chat/read", {
      method: "PATCH",
      auth: false,
      headers: {
        "x-guest-token": activeSession.guestToken,
        "x-customer-id": activeSession.customerId,
      },
    }).catch(() => {});

    // Socket mark read
    if (socketRef.current?.connected) {
      socketRef.current.emit("mark_read", {
        customerId: activeSession.customerId,
      });
    }
  }, []);

  // Bootstrap guest session if absent on mount
  useEffect(() => {
    if (!session) {
      initSession();
    }
    // Fetch customer question prompts
    api("/chat/prompts")
      .then((res) => {
        if (res?.data?.prompts?.length) {
          setCustomerPrompts(res.data.prompts);
        }
      })
      .catch(() => {});
  }, [session, initSession]);

  // Load message history when chat is toggled open
  useEffect(() => {
    if (isOpen && session) {
      loadMessages(session);
      markMessagesRead(session);
    }
  }, [isOpen, session, loadMessages, markMessagesRead]);

  // Set up or reconnect customer socket
  useEffect(() => {
    if (!session?.guestToken || !session?.customerId) return;

    const socket = createCustomerSocket(session);
    if (!socket) return;
    socketRef.current = socket;

    socket.on("connect", () => {
      // Mark read if chat is currently open
      if (isOpenRef.current) {
        markMessagesRead(session);
      }
    });

    socket.on("new_message", ({ message }) => {
      setMessages((prev) => {
        // Prevent duplicate if already received
        const exists = prev.some(
          (m) =>
            m._id === message._id ||
            (m.clientMessageId && m.clientMessageId === message.clientMessageId)
        );
        if (exists) {
          return prev.map((m) =>
            m.clientMessageId === message.clientMessageId ? message : m
          );
        }
        return [...prev, message];
      });

      if (message.senderType === "admin") {
        setAdminTyping(false);
        if (!isOpenRef.current) {
          setUnreadCount((c) => c + 1);
        } else {
          markMessagesRead(session);
        }
      }

      setTimeout(() => scrollToBottom("smooth"), 50);
    });

    socket.on("messages_read", ({ readerRole }) => {
      if (readerRole === "admin") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderType === "customer"
              ? { ...msg, deliveryStatus: "read" }
              : msg
          )
        );
      }
    });

    socket.on("typing_start", ({ senderType }) => {
      if (senderType === "admin") {
        setAdminTyping(true);
        setTimeout(() => scrollToBottom("smooth"), 50);
      }
    });

    socket.on("typing_stop", ({ senderType }) => {
      if (senderType === "admin") {
        setAdminTyping(false);
      }
    });

    socket.on("user_online", ({ role }) => {
      if (role === "admin") {
        setAdminOnline(true);
      }
    });

    socket.on("user_offline", ({ role }) => {
      if (role === "admin") {
        setAdminOnline(false);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.guestToken, session?.customerId, markMessagesRead, scrollToBottom]);

  // Handle external open trigger: window.dispatchEvent(new CustomEvent('open-atelier-chat', { detail: { orderCode, defaultMessage } }))
  useEffect(() => {
    const handleExternalOpen = async (e) => {
      setIsOpen(true);
      let curSession = session;
      if (!curSession) {
        curSession = await initSession();
      }
      if (curSession) {
        loadMessages(curSession);
        markMessagesRead(curSession);
      }
      if (e.detail?.orderCode) {
        setRelatedOrderRef(e.detail.orderCode);
      }
      if (e.detail?.defaultMessage && !inputText) {
        setInputText(e.detail.defaultMessage);
      }
    };

    window.addEventListener("open-atelier-chat", handleExternalOpen);
    return () => {
      window.removeEventListener("open-atelier-chat", handleExternalOpen);
    };
  }, [session, initSession, loadMessages, markMessagesRead, inputText]);

  // When widget is opened, initialize session if needed and load messages
  const handleOpenToggle = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState) {
      let curSession = session;
      if (!curSession) {
        curSession = await initSession();
      }
      if (curSession) {
        await loadMessages(curSession);
        markMessagesRead(curSession);
      }
    }
  };

  // Emit typing indicators when customer types
  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputText(text);

    if (!session || !socketRef.current?.connected) return;

    if (!isTypingRef.current && text.trim().length > 0) {
      isTypingRef.current = true;
      socketRef.current.emit("typing_start", {
        customerId: session.customerId,
      });
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit("typing_stop", {
          customerId: session.customerId,
        });
      }
    }, 2000);
  };

  // Stop typing state immediately on input blur
  const handleInputBlur = () => {
    if (isTypingRef.current && socketRef.current?.connected && session) {
      isTypingRef.current = false;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      socketRef.current.emit("typing_stop", {
        customerId: session.customerId,
      });
    }
  };

  // Copy direct chat link to clipboard
  const handleCopyLink = async () => {
    try {
      const url = window.location.origin + "/chat";
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
    }
  };

  // Download official conversation transcript
  const handleDownloadTranscript = async () => {
    if (!session?.guestToken || !session?.customerId || isExporting) return;
    setIsExporting(true);
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${base}/chat/transcript`, {
        headers: {
          "x-guest-token": session.guestToken,
          "x-customer-id": session.customerId,
        },
      });
      if (!res.ok) throw new Error("Export failed");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `khwabstitch-transcript-${session.customerId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert(t("Could not download transcript. Please try again."));
    } finally {
      setIsExporting(false);
    }
  };

  // Send customer text message (or prompt chip)
  const sendCustomerMessage = async (content) => {
    if (!content || isSending) return;

    let curSession = session;
    if (!curSession) {
      curSession = await initSession();
    }
    if (!curSession) return;

    setIsSending(true);
    setInputText("");

    // Stop typing indicator immediately
    if (isTypingRef.current && socketRef.current?.connected) {
      isTypingRef.current = false;
      socketRef.current.emit("typing_stop", {
        customerId: curSession.customerId,
      });
    }

    const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg = {
      _id: clientMessageId,
      clientMessageId,
      conversationId: curSession.conversationId,
      customerId: curSession.customerId,
      senderType: "customer",
      senderId: curSession.customerId,
      senderName: curSession.displayName || t("You"),
      messageType: "text",
      content,
      attachment: null,
      deliveryStatus: "sent",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom("smooth"), 30);

    try {
      const res = await api("/chat/messages", {
        method: "POST",
        auth: false,
        headers: {
          "x-guest-token": curSession.guestToken,
          "x-customer-id": curSession.customerId,
        },
        body: {
          clientMessageId,
          content,
          relatedOrderReference: relatedOrderRef || undefined,
        },
      });

      if (res?.data?.message) {
        setMessages((prev) => {
          let updated = prev.map((m) =>
            m.clientMessageId === clientMessageId ? res.data.message : m
          );
          if (res.data.autoGreeting) {
            const greetingExists = updated.some(
              (m) =>
                m._id === res.data.autoGreeting._id ||
                m.clientMessageId === res.data.autoGreeting.clientMessageId
            );
            if (!greetingExists) {
              updated = [...updated, res.data.autoGreeting];
            }
          }
          return updated;
        });
        setTimeout(() => scrollToBottom("smooth"), 50);
      }
    } catch {
      // Keep optimistic message or mark error
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    const content = inputText.trim();
    if (content) {
      sendCustomerMessage(content);
    }
  };

  const handleSendPrompt = (promptText) => {
    sendCustomerMessage(promptText);
  };

  // Upload image attachment
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || isUploading || !session) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert(t("Use a standard JPEG, PNG or WebP image."));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(t("Image must be under 5 MiB."));
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await api("/chat/upload", {
        method: "POST",
        auth: false,
        headers: {
          "x-guest-token": session.guestToken,
          "x-customer-id": session.customerId,
        },
        body: formData,
      });

      if (uploadRes?.data?.url) {
        const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const attachData = uploadRes.data;

        const optimisticImageMsg = {
          _id: clientMessageId,
          clientMessageId,
          conversationId: session.conversationId,
          customerId: session.customerId,
          senderType: "customer",
          senderId: session.customerId,
          senderName: session.displayName || t("You"),
          messageType: "image",
          content: "",
          attachment: {
            fileId: attachData.fileId,
            filePath: attachData.filePath,
            url: attachData.url,
            width: attachData.width,
            height: attachData.height,
            mime: attachData.mime,
            size: attachData.size,
          },
          deliveryStatus: "sent",
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimisticImageMsg]);
        setTimeout(() => scrollToBottom("smooth"), 30);

        const res = await api("/chat/messages", {
          method: "POST",
          auth: false,
          headers: {
            "x-guest-token": session.guestToken,
            "x-customer-id": session.customerId,
          },
          body: {
            clientMessageId,
            content: "",
            attachment: {
              fileId: attachData.fileId,
              filePath: attachData.filePath,
              url: attachData.url,
              width: attachData.width,
              height: attachData.height,
              mime: attachData.mime,
              size: attachData.size,
            },
            relatedOrderReference: relatedOrderRef || undefined,
          },
        });

        if (res?.data?.message) {
          setMessages((prev) => {
            let updated = prev.map((m) =>
              m.clientMessageId === clientMessageId ? res.data.message : m
            );
            if (res.data.autoGreeting) {
              const greetingExists = updated.some(
                (m) =>
                  m._id === res.data.autoGreeting._id ||
                  m.clientMessageId === res.data.autoGreeting.clientMessageId
              );
              if (!greetingExists) {
                updated = [...updated, res.data.autoGreeting];
              }
            }
            return updated;
          });
          setTimeout(() => scrollToBottom("smooth"), 50);
        }
      }
    } catch {
      alert(t("Could not upload image. Please try again."));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Update customer display name
  const handleSaveDisplayName = async (e) => {
    e.preventDefault();
    if (!session || !displayNameInput.trim()) return;

    try {
      const res = await api("/chat/profile", {
        method: "PATCH",
        auth: false,
        headers: {
          "x-guest-token": session.guestToken,
          "x-customer-id": session.customerId,
        },
        body: { displayName: displayNameInput.trim() },
      });

      if (res?.data?.displayName) {
        const updated = { ...session, displayName: res.data.displayName };
        saveChatSession(updated);
        setSession(updated);
        setEditingName(false);
      }
    } catch {
      setEditingName(false);
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <button
        ref={launcherRef}
        type="button"
        className="khwab-chat-launcher"
        onClick={handleOpenToggle}
        aria-label={isOpen ? t("Close chat") : t("Chat with KhwabStitch Atelier")}
        title={t("Chat with KhwabStitch Atelier")}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
        {!isOpen && unreadCount > 0 && (
          <span className="khwab-chat-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {/* Chat Window Modal */}
      {isOpen && (
        <section
          ref={windowRef}
          className="khwab-chat-window"
          aria-label={t("Customer Chat Window")}
          role="dialog"
          aria-modal="true"
          style={
            position && typeof window !== "undefined" && window.innerWidth > 640
              ? {
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  right: "auto",
                  bottom: "auto",
                  animation: "none",
                }
              : undefined
          }
        >
          {/* Header */}
          <header
            className={`khwab-chat-header ${isDragging ? "is-dragging" : ""}`}
            onPointerDown={handleHeaderPointerDown}
            title={t("Drag to move")}
          >
            <div className="khwab-chat-header-info">
              <div className="khwab-chat-avatar">
                <img
                  src="/atelier/monogram.webp"
                  alt="KhwabStitch"
                  width="40"
                  height="40"
                  decoding="async"
                />
              </div>
              <div className="khwab-chat-title-group">
                <h4>KhwabStitch</h4>
                <div className="khwab-chat-status">
                  <span
                    className={`khwab-chat-status-dot ${adminOnline ? "online" : ""}`}
                  />
                  <span>
                    {adminOnline ? t("Atelier Master Tailor Online") : t("Atelier Studio")}
                  </span>
                </div>
              </div>
            </div>

            <div className="khwab-chat-header-actions">
              <button
                type="button"
                className="khwab-chat-header-btn"
                onClick={handleCopyLink}
                aria-label={copiedLink ? t("Link copied!") : t("Copy chat link")}
                title={copiedLink ? t("Link copied!") : t("Copy chat link")}
              >
                {copiedLink ? <Check size={18} /> : <Share2 size={18} />}
              </button>
              <button
                type="button"
                className="khwab-chat-header-btn"
                onClick={handleDownloadTranscript}
                disabled={isExporting}
                aria-label={t("Download transcript")}
                title={t("Download transcript")}
              >
                {isExporting ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
              </button>
              <button
                type="button"
                className="khwab-chat-header-btn"
                onClick={() => setEditingName((v) => !v)}
                aria-label={t("Set your name")}
                title={t("Set your name")}
              >
                <User size={18} />
              </button>
              <button
                type="button"
                className="khwab-chat-header-btn"
                onClick={() => {
                  setIsOpen(false);
                  launcherRef.current?.focus();
                }}
                aria-label={t("Close chat")}
              >
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Optional Display Name Editor Form */}
          {editingName && (
            <form
              onSubmit={handleSaveDisplayName}
              style={{
                padding: "8px 14px",
                background: "#f7f2eb",
                borderBottom: "1px solid #e8e0d5",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                className="khwab-chat-input"
                style={{ padding: "6px 10px", fontSize: "12px", minHeight: "30px" }}
                placeholder={t("Your name (optional)")}
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                maxLength={60}
              />
              <button
                type="submit"
                className="khwab-chat-btn-send"
                style={{ width: "30px", height: "30px" }}
                title={t("Save")}
              >
                <Check size={14} />
              </button>
            </form>
          )}

          {/* Message List */}
          <div className="khwab-chat-messages" tabIndex={0} role="log" aria-live="polite">
            <div className="khwab-chat-welcome-banner">
              <strong>{t("Welcome to KhwabStitch Atelier")}</strong>
              <p>
                {t(
                  "Ask questions about bespoke stitching, fabric choices, measurements, or check your order progress."
                )}
              </p>
            </div>

            {messages.map((msg, index) => {
              const showDate =
                index === 0 ||
                new Date(msg.createdAt).toDateString() !==
                  new Date(messages[index - 1].createdAt).toDateString();

              const isCustomer = msg.senderType === "customer";

              return (
                <div key={msg._id || msg.clientMessageId || index}>
                  {showDate && (
                    <div className="khwab-chat-date-divider">
                      <span>{formatMessageDate(msg.createdAt)}</span>
                    </div>
                  )}

                  <div className={`khwab-chat-msg-row ${isCustomer ? "customer" : "admin"}`}>
                    <div className="khwab-chat-bubble">
                      {msg.attachment?.url && (
                        <div
                          className="khwab-chat-image-wrap"
                          onClick={() => setLightboxImage(msg.attachment.url)}
                          role="button"
                          tabIndex={0}
                          aria-label={t("View photo")}
                        >
                          <img
                            src={msg.attachment.url}
                            alt={t("Shared design reference")}
                            loading="lazy"
                          />
                        </div>
                      )}
                      {msg.content && <div>{msg.content}</div>}
                    </div>

                    <div className="khwab-chat-meta">
                      <span>{formatMessageTime(msg.createdAt)}</span>
                      {isCustomer && (
                        <span
                          className={`khwab-chat-receipt ${
                            msg.deliveryStatus === "read" ? "read" : ""
                          }`}
                          title={msg.deliveryStatus}
                        >
                          {msg.deliveryStatus === "read" ? (
                            <CheckCheck size={14} />
                          ) : msg.deliveryStatus === "delivered" ? (
                            <CheckCheck size={14} />
                          ) : (
                            <Check size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {adminTyping && (
              <div className="khwab-chat-typing" aria-label={t("Atelier is typing")}>
                <span />
                <span />
                <span />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Customer Question Prompt Chips & Page Context */}
          <div className="khwab-chat-context-section" aria-label={t("Page context suggestions")}>
            <div className="khwab-chat-context-bar">
              <div className="khwab-chat-context-tag">
                <Compass size={13} aria-hidden="true" />
                <span>{t(pageContext.title)}</span>
              </div>
              <span className="khwab-chat-context-hint">
                {t("Tap a quick question or type your own below:")}
              </span>
            </div>

            <div className="khwab-chat-quick-prompts" aria-label={t("Customer Question Prompts")}>
              {(pageContext.prompts?.length ? pageContext.prompts : customerPrompts).map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="khwab-chat-prompt-chip"
                  onClick={() => handleSendPrompt(prompt)}
                  disabled={isSending}
                  title={t(prompt)}
                >
                  <span>{t(prompt)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Composer Footer */}
          <footer className="khwab-chat-composer">
            {relatedOrderRef && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#145d58",
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0 4px",
                }}
              >
                <span>
                  {t("Order reference:")} <strong>{relatedOrderRef}</strong>
                </span>
                <button
                  type="button"
                  style={{
                    border: "none",
                    background: "none",
                    color: "#8c8275",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                  onClick={() => setRelatedOrderRef("")}
                >
                  {t("Remove")}
                </button>
              </div>
            )}

            <form className="khwab-chat-composer-row" onSubmit={handleSendMessage}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />

              <button
                type="button"
                className="khwab-chat-btn-icon"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("Attach design photo")}
                title={t("Attach design photo")}
              >
                {isUploading ? <Loader2 size={18} className="spin" /> : <Paperclip size={18} />}
              </button>

              <textarea
                ref={composerInputRef}
                className="khwab-chat-input"
                rows={1}
                placeholder={t("Type your message\u2026")}
                value={inputText}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              <button
                type="submit"
                className="khwab-chat-btn-send"
                disabled={!inputText.trim() || isSending}
                aria-label={t("Send message")}
                title={t("Send message")}
              >
                {isSending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              </button>
            </form>
          </footer>
        </section>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="khwab-chat-lightbox"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="khwab-chat-lightbox-close"
            onClick={() => setLightboxImage(null)}
            aria-label={t("Close preview")}
          >
            <X size={24} />
          </button>
          <img src={lightboxImage} alt={t("Enlarged reference")} />
        </div>
      )}
    </>
  );
}
