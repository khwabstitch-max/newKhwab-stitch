import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Loader2,
  X,
  ChevronLeft,
  ArrowLeft,
  User,
  MessageSquare,
  Lock,
  Unlock,
  ExternalLink,
  Save,
  Download,
  Settings,
  Plus,
  Trash2,
} from "lucide-react";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sessionStore } from "../lib/session";
import { createAdminSocket } from "../lib/chat-socket";
import "./admin-chat.css";

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

function formatConversationDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function AdminChatDashboard() {
  useLanguage();
  const { user } = useAuth();
  const [authToken, setAuthToken] = useState(() => sessionStore.get()?.token || "");
  const [socketConnected, setSocketConnected] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 1280 : false
  );
  const [tab, setTab] = useState("all"); // 'all', 'unread', 'active', 'closed'
  const [searchTerm, setSearchTerm] = useState("");
  const [conversations, setConversations] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickRepliesManager, setShowQuickRepliesManager] = useState(false);
  const [newQuickReplyText, setNewQuickReplyText] = useState("");
  const [isSavingQuickReplies, setIsSavingQuickReplies] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [autoGreeting, setAutoGreeting] = useState({
    enabled: true,
    message:
      "Hello! Welcome to KhwabStitch Atelier. Thank you for reaching out! Please share the design or outfit you would like stitched, and our master craftsman will assist you shortly.",
  });
  const [customerPrompts, setCustomerPrompts] = useState([
    "Custom Stitching Enquiry",
    "How to provide measurements?",
    "Price estimate for suit / kurti",
    "Turnaround and delivery time",
  ]);
  const [newCustomerPromptText, setNewCustomerPromptText] = useState("");
  const [settingsActiveTab, setSettingsActiveTab] = useState("greeting"); // "greeting" | "quickReplies" | "customerPrompts"
  const [settingsSuccessNotice, setSettingsSuccessNotice] = useState("");

  const socketRef = useRef(null);
  const threadRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const selectedCustomerIdRef = useRef(selectedCustomerId);
  selectedCustomerIdRef.current = selectedCustomerId;
  const prevCustomerIdRef = useRef(null);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (threadRef.current) {
      threadRef.current.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: behavior === "auto" ? "auto" : "smooth",
      });
    } else if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }, []);

  // 1. Fetch conversations list
  const loadConversations = useCallback(async (filterTab = tab, search = searchTerm) => {
    try {
      let query = `/admin/chat/conversations?limit=50`;
      if (filterTab && filterTab !== "all") query += `&status=${filterTab}`;
      if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;

      const res = await api(query, { auth: true });
      if (res?.data) {
        setConversations(res.data.conversations || []);
        if (res.data.pagination?.totalUnread !== undefined) {
          setTotalUnread(res.data.pagination.totalUnread);
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoadingList(false);
    }
  }, [tab, searchTerm]);

  // Initial load and filter change
  useEffect(() => {
    loadConversations(tab, searchTerm);
  }, [tab, searchTerm, loadConversations]);

  // Load configurable chat automation & quick replies
  useEffect(() => {
    api("/admin/chat/settings", { auth: true })
      .then((res) => {
        if (res?.data) {
          if (res.data.autoGreeting) setAutoGreeting(res.data.autoGreeting);
          if (res.data.quickReplies?.length) setQuickReplies(res.data.quickReplies);
          if (res.data.customerPrompts?.length) setCustomerPrompts(res.data.customerPrompts);
        }
      })
      .catch(() => {});
  }, []);

  // 2. Select a conversation and load messages
  const selectConversation = useCallback(async (customerId) => {
    setSelectedCustomerId(customerId);
    selectedCustomerIdRef.current = customerId;
    setMessages([]);
    setCustomerTyping(false);

    try {
      // Fetch conversation metadata
      const convRes = await api(`/admin/chat/conversations/${customerId}`, { auth: true });
      if (convRes?.data?.conversation) {
        setActiveConversation(convRes.data.conversation);
        setCustomerNotes(convRes.data.customer?.notes || "");
      }

      // Fetch messages
      const msgRes = await api(`/admin/chat/conversations/${customerId}/messages?limit=60`, { auth: true });
      if (msgRes?.data?.messages) {
        setMessages(msgRes.data.messages);
        setTimeout(() => scrollToBottom("auto"), 50);
      }

      // Mark read via API
      api(`/admin/chat/conversations/${customerId}/read`, { method: "PATCH", auth: true }).catch(() => {});

      // Notify socket
      if (socketRef.current?.connected) {
        socketRef.current.emit("admin_join_conversation", { customerId });
        socketRef.current.emit("mark_read", { customerId });
      }

      // Update local unread counter in list
      setConversations((prev) =>
        prev.map((c) => (c.customerId === customerId ? { ...c, unreadCountAdmin: 0 } : c))
      );
    } catch {
      // Error loading conversation
    }
  }, [scrollToBottom]);

  // Keep auth token synced from sessionStore
  useEffect(() => {
    return sessionStore.subscribe((next) => {
      setAuthToken(next?.token || "");
    });
  }, []);

  // 3. Socket.IO admin connection (lifecycle tied strictly to auth token)
  useEffect(() => {
    const token = authToken || sessionStore.get()?.token;
    if (!token) return;

    const socket = createAdminSocket(token);
    if (!socket) return;
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      if (selectedCustomerIdRef.current) {
        socket.emit("admin_join_conversation", { customerId: selectedCustomerIdRef.current });
      }
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    socket.on("new_message", ({ message, conversation }) => {
      // If message belongs to currently open customer
      if (message.customerId === selectedCustomerIdRef.current) {
        setMessages((prev) => {
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

        if (message.senderType === "customer") {
          setCustomerTyping(false);
          socket.emit("mark_read", { customerId: selectedCustomerIdRef.current });
        }

        setTimeout(() => scrollToBottom("smooth"), 50);
      }

      // Update conversation in sidebar list
      setConversations((prev) => {
        const found = prev.find((c) => c.customerId === message.customerId);
        if (found) {
          const isCurrent = message.customerId === selectedCustomerIdRef.current;
          return [
            {
              ...found,
              lastMessage: {
                content:
                  message.content ||
                  (message.messageType === "image" ? "Photo attachment" : ""),
                senderType: message.senderType,
                messageType: message.messageType,
                createdAt: message.createdAt,
              },
              lastMessageAt: message.createdAt,
              unreadCountAdmin: isCurrent
                ? 0
                : (conversation?.unreadCountAdmin ?? found.unreadCountAdmin + 1),
            },
            ...prev.filter((c) => c.customerId !== message.customerId),
          ];
        }
        // If not found in list, reload conversations
        loadConversations();
        return prev;
      });
    });

    socket.on("inbox_update", ({ customerId, lastMessage, unreadCountAdmin }) => {
      setConversations((prev) => {
        const found = prev.find((c) => c.customerId === customerId);
        if (found) {
          const isCurrent = customerId === selectedCustomerIdRef.current;
          const updated = {
            ...found,
            lastMessage: {
              content:
                lastMessage?.content ||
                (lastMessage?.messageType === "image" ? "Photo attachment" : ""),
              senderType: lastMessage?.senderType || "customer",
              messageType: lastMessage?.messageType || "text",
              createdAt: lastMessage?.createdAt || new Date().toISOString(),
            },
            lastMessageAt: lastMessage?.createdAt || new Date().toISOString(),
            unreadCountAdmin: isCurrent
              ? 0
              : (unreadCountAdmin ?? found.unreadCountAdmin + 1),
          };
          return [updated, ...prev.filter((c) => c.customerId !== customerId)];
        }
        loadConversations();
        return prev;
      });
      if (customerId !== selectedCustomerIdRef.current && unreadCountAdmin !== undefined) {
        setTotalUnread((prev) => Math.max(0, prev + 1));
      }
    });

    socket.on("messages_read", ({ readerRole, customerId }) => {
      if (readerRole === "customer" && customerId === selectedCustomerIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderType === "admin" ? { ...msg, deliveryStatus: "read" } : msg
          )
        );
      }
    });

    socket.on("typing_start", ({ senderType, customerId }) => {
      if (senderType === "customer" && customerId === selectedCustomerIdRef.current) {
        setCustomerTyping(true);
        setTimeout(() => scrollToBottom("smooth"), 50);
      }
    });

    socket.on("typing_stop", ({ senderType, customerId }) => {
      if (senderType === "customer" && customerId === selectedCustomerIdRef.current) {
        setCustomerTyping(false);
      }
    });

    socket.on("conversation_status_change", ({ customerId, status }) => {
      setConversations((prev) =>
        prev.map((c) => (c.customerId === customerId ? { ...c, status } : c))
      );
      if (selectedCustomerIdRef.current === customerId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authToken, loadConversations, scrollToBottom]);

  // Seamless room switching without tearing down master socket
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    if (prevCustomerIdRef.current && prevCustomerIdRef.current !== selectedCustomerId) {
      socket.emit("admin_leave_conversation", { customerId: prevCustomerIdRef.current });
    }

    if (selectedCustomerId) {
      socket.emit("admin_join_conversation", { customerId: selectedCustomerId });
      socket.emit("mark_read", { customerId: selectedCustomerId });
    }

    prevCustomerIdRef.current = selectedCustomerId;
  }, [selectedCustomerId]);

  // 4. Send admin message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const content = inputText.trim();
    if (!content || isSending || !selectedCustomerId) return;

    setIsSending(true);
    setInputText("");

    if (isTypingRef.current && socketRef.current?.connected) {
      isTypingRef.current = false;
      socketRef.current.emit("typing_stop", { customerId: selectedCustomerId });
    }

    const clientMessageId = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg = {
      _id: clientMessageId,
      clientMessageId,
      conversationId: activeConversation?._id,
      customerId: selectedCustomerId,
      senderType: "admin",
      senderId: String(user?._id || "admin"),
      senderName: user?.name || "Khwab Stitch Atelier",
      messageType: "text",
      content,
      attachment: null,
      deliveryStatus: "sent",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom("smooth"), 30);

    try {
      const res = await api(`/admin/chat/conversations/${selectedCustomerId}/messages`, {
        method: "POST",
        auth: true,
        body: { clientMessageId, content },
      });

      if (res?.data?.message) {
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMessageId ? res.data.message : m))
        );
        setConversations((prev) => {
          const found = prev.find((c) => c.customerId === selectedCustomerId);
          if (found) {
            return [
              {
                ...found,
                lastMessage: {
                  content,
                  senderType: "admin",
                  messageType: "text",
                  createdAt: res.data.message.createdAt,
                },
                lastMessageAt: res.data.message.createdAt,
              },
              ...prev.filter((c) => c.customerId !== selectedCustomerId),
            ];
          }
          return prev;
        });
      }
    } catch {
      alert(t("Could not send reply. Please try again."));
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
    } finally {
      setIsSending(false);
    }
  };

  // 5. Upload admin image
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || isUploading || !selectedCustomerId) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await api("/admin/chat/upload", {
        method: "POST",
        auth: true,
        body: formData,
      });

      if (uploadRes?.data?.url) {
        const clientMessageId = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const attachData = uploadRes.data;

        const msgRes = await api(`/admin/chat/conversations/${selectedCustomerId}/messages`, {
          method: "POST",
          auth: true,
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
          },
        });

        if (msgRes?.data?.message) {
          setMessages((prev) => {
            const exists = prev.some((m) => m.clientMessageId === clientMessageId);
            return exists ? prev : [...prev, msgRes.data.message];
          });
          setConversations((prev) => {
            const found = prev.find((c) => c.customerId === selectedCustomerId);
            if (found) {
              return [
                {
                  ...found,
                  lastMessage: {
                    content: t("Photo attachment"),
                    senderType: "admin",
                    messageType: "image",
                    createdAt: msgRes.data.message.createdAt,
                  },
                  lastMessageAt: msgRes.data.message.createdAt,
                },
                ...prev.filter((c) => c.customerId !== selectedCustomerId),
              ];
            }
            return prev;
          });
        }
      }
    } catch {
      alert(t("Could not upload image. Please try again."));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 6. Close or Reopen Conversation
  const handleToggleStatus = async () => {
    if (!selectedCustomerId || !activeConversation) return;
    const nextStatus = activeConversation.status === "closed" ? "active" : "closed";

    try {
      const res = await api(`/admin/chat/conversations/${selectedCustomerId}/status`, {
        method: "PATCH",
        auth: true,
        body: { status: nextStatus },
      });

      if (res?.data?.conversation) {
        setActiveConversation(res.data.conversation);
        setConversations((prev) =>
          prev.map((c) =>
            c.customerId === selectedCustomerId ? { ...c, status: nextStatus } : c
          )
        );
      }
    } catch {
      alert(t("Failed to update conversation status."));
    }
  };

  // 7. Save Customer Notes
  const handleSaveNotes = async () => {
    if (!selectedCustomerId) return;
    setIsSavingNotes(true);
    try {
      await api(`/admin/chat/conversations/${selectedCustomerId}/notes`, {
        method: "PATCH",
        auth: true,
        body: { notes: customerNotes },
      });
      alert(t("Notes saved."));
    } catch {
      alert(t("Failed to save notes."));
    } finally {
      setIsSavingNotes(false);
    }
  };

  // 8. Admin Typing input change
  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputText(text);

    if (!selectedCustomerId || !socketRef.current?.connected) return;

    if (!isTypingRef.current && text.trim().length > 0) {
      isTypingRef.current = true;
      socketRef.current.emit("typing_start", { customerId: selectedCustomerId });
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit("typing_stop", { customerId: selectedCustomerId });
      }
    }, 2000);
  };

  // Stop typing indicator on blur
  const handleInputBlur = () => {
    if (isTypingRef.current && socketRef.current?.connected && selectedCustomerId) {
      isTypingRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      socketRef.current.emit("typing_stop", { customerId: selectedCustomerId });
    }
  };

  // Export conversation transcript as txt file
  const handleExportTranscript = async () => {
    if (!selectedCustomerId || isExporting) return;
    setIsExporting(true);
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${base}/admin/chat/conversations/${selectedCustomerId}/transcript`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `khwabstitch-admin-transcript-${selectedCustomerId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert(t("Could not export transcript. Please try again."));
    } finally {
      setIsExporting(false);
    }
  };

  const defaultPhrases = [
    t("Hello! Welcome to KhwabStitch. How can we help you with your stitching today?"),
    t("Could you please share the fabric type and your preferred neck and sleeve design?"),
    t("We would be glad to tailor this for you. Standard turnaround is 3-5 days."),
    t("You can provide your measurements via our measurement guide or send a sample garment."),
  ];

  // Manage configurable chat automation & quick replies
  const handleSaveAllSettings = async () => {
    setIsSavingQuickReplies(true);
    try {
      const res = await api("/admin/chat/settings", {
        method: "PUT",
        auth: true,
        body: {
          autoGreeting,
          quickReplies: quickReplies.length > 0 ? quickReplies : defaultPhrases,
          customerPrompts,
        },
      });
      if (res?.data) {
        if (res.data.autoGreeting) setAutoGreeting(res.data.autoGreeting);
        if (res.data.quickReplies) setQuickReplies(res.data.quickReplies);
        if (res.data.customerPrompts) setCustomerPrompts(res.data.customerPrompts);
        setSettingsSuccessNotice(t("Chat settings saved successfully."));
        setTimeout(() => setSettingsSuccessNotice(""), 3500);
      }
    } catch {
      alert(t("Could not update chat settings."));
    } finally {
      setIsSavingQuickReplies(false);
    }
  };

  const handleAddQuickReply = (e) => {
    e.preventDefault();
    const text = newQuickReplyText.trim();
    if (!text) return;
    const currentList = quickReplies.length > 0 ? quickReplies : defaultPhrases;
    setQuickReplies([...currentList, text]);
    setNewQuickReplyText("");
  };

  const handleDeleteQuickReply = (index) => {
    const currentList = quickReplies.length > 0 ? quickReplies : defaultPhrases;
    if (currentList.length <= 1) {
      alert(t("You must keep at least one quick reply."));
      return;
    }
    setQuickReplies(currentList.filter((_, i) => i !== index));
  };

  const handleAddCustomerPrompt = (e) => {
    e.preventDefault();
    const text = newCustomerPromptText.trim();
    if (!text) return;
    setCustomerPrompts((prev) => [...prev, text]);
    setNewCustomerPromptText("");
  };

  const handleDeleteCustomerPrompt = (index) => {
    if (customerPrompts.length <= 1) {
      alert(t("You must keep at least one quick reply."));
      return;
    }
    setCustomerPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  const activeQuickReplies = quickReplies.length > 0 ? quickReplies : defaultPhrases;

  return (
    <div className="container page admin-chat-page-wrap">
      {/* Top Breadcrumb & Live Status Bar */}
      <div className="admin-chat-top-bar">
        <div className="admin-chat-top-left">
          <Link to="/admin" className="admin-chat-top-back-btn">
            <ArrowLeft size={16} />
            <span>{t("Back to Atelier Dashboard")}</span>
          </Link>
          <span className="admin-chat-top-sep">/</span>
          <span className="admin-chat-top-page-title">{t("Customer Live Chat")}</span>
        </div>

        <div className="admin-chat-top-right">
          <div className={`admin-chat-live-badge ${socketConnected ? "connected" : "connecting"}`}>
            <span className="admin-chat-pulse-dot" />
            <span>{socketConnected ? t("Live & Connected") : t("Connecting\u2026")}</span>
          </div>
          <button
            type="button"
            className="admin-chat-top-tool-btn"
            onClick={() => setShowQuickRepliesManager(true)}
            title={t("Chat Automation & Quick Replies")}
          >
            <Settings size={14} />
            <span>{t("Chat Automation & Quick Replies")}</span>
          </button>
        </div>
      </div>

      <div className="admin-chat-container">
        {/* Column 1: Conversations Sidebar */}
        <aside
          className={`admin-chat-sidebar ${selectedCustomerId ? "mobile-hidden" : ""}`}
        >
          <header className="admin-chat-sidebar-header">
            <div className="admin-chat-sidebar-title">
              <h2>{t("Customer Chats")}</h2>
              {totalUnread > 0 && (
                <span className="admin-chat-tab-badge">
                  {totalUnread} {t("new")}
                </span>
              )}
            </div>

            <div className="admin-chat-search-wrap">
              <Search size={15} className="admin-chat-search-icon" />
              <input
                type="text"
                className="admin-chat-search-input"
                placeholder={t("Search conversations\u2026")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </header>

          <nav className="admin-chat-tabs">
            <button
              type="button"
              className={`admin-chat-tab-btn ${tab === "all" ? "active" : ""}`}
              onClick={() => setTab("all")}
            >
              {t("All")}
            </button>
            <button
              type="button"
              className={`admin-chat-tab-btn ${tab === "unread" ? "active" : ""}`}
              onClick={() => setTab("unread")}
            >
              {t("Unread")}
              {totalUnread > 0 && (
                <span className="admin-chat-tab-badge">{totalUnread}</span>
              )}
            </button>
            <button
              type="button"
              className={`admin-chat-tab-btn ${tab === "active" ? "active" : ""}`}
              onClick={() => setTab("active")}
            >
              {t("Active")}
            </button>
            <button
              type="button"
              className={`admin-chat-tab-btn ${tab === "closed" ? "active" : ""}`}
              onClick={() => setTab("closed")}
            >
              {t("Closed")}
            </button>
          </nav>

          <ul className="admin-chat-conv-list">
            {isLoadingList ? (
              <li style={{ padding: "20px", textAlign: "center", color: "#8c8275" }}>
                <Loader2 size={20} className="spin" />
              </li>
            ) : conversations.length === 0 ? (
              <li style={{ padding: "30px 16px", textAlign: "center", color: "#8c8275" }}>
                <p style={{ margin: 0, fontSize: "13px" }}>{t("No conversations found.")}</p>
              </li>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.customerId === selectedCustomerId;
                const initial = (conv.displayName || conv.customerId || "C").trim().charAt(0).toUpperCase();
                return (
                  <li
                    key={conv.customerId}
                    className={`admin-chat-conv-item ${isSelected ? "selected" : ""}`}
                    onClick={() => selectConversation(conv.customerId)}
                  >
                    <div className="admin-chat-conv-avatar">
                      {initial}
                    </div>
                    <div className="admin-chat-conv-main">
                      <div className="admin-chat-conv-top">
                        <span className="admin-chat-conv-name">
                          {conv.displayName || conv.customerId}
                        </span>
                        <span className="admin-chat-conv-time">
                          {formatConversationDate(conv.lastMessageAt || conv.updatedAt)}
                        </span>
                      </div>

                      <div className="admin-chat-conv-snippet">
                        {conv.lastMessage?.content ||
                          (conv.lastMessage?.messageType === "image"
                            ? t("Photo attachment")
                            : t("No messages yet"))}
                      </div>

                      <div className="admin-chat-conv-bottom">
                        <span className={`admin-chat-status-pill ${conv.status || "active"}`}>
                          {conv.status === "closed" ? t("Closed") : t("Active")}
                        </span>

                        {conv.unreadCountAdmin > 0 && (
                          <span className="admin-chat-unread-badge">
                            {conv.unreadCountAdmin}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* Column 2: Main Chat Window */}
        <main
          className={`admin-chat-main ${!selectedCustomerId ? "mobile-hidden" : ""}`}
        >
          {selectedCustomerId ? (
            <>
              {/* Header */}
              <header className="admin-chat-main-header">
                <div className="admin-chat-main-header-info">
                  <button
                    type="button"
                    className="admin-chat-back-btn"
                    onClick={() => setSelectedCustomerId(null)}
                    aria-label={t("Back to list")}
                    title={t("Back to list")}
                  >
                    <ChevronLeft size={20} />
                    <span>{t("Back to list")}</span>
                  </button>

                  <div className="admin-chat-header-avatar">
                    {(activeConversation?.displayName || selectedCustomerId || "C").trim().charAt(0).toUpperCase()}
                  </div>

                  <div className="admin-chat-main-title">
                    <h3>
                      {activeConversation?.displayName || selectedCustomerId}
                    </h3>
                    <span>{selectedCustomerId}</span>
                  </div>
                </div>

                <div className="admin-chat-actions">
                  <button
                    type="button"
                    className={`admin-chat-btn-action ${showDetailsPanel ? "active" : ""}`}
                    onClick={() => setShowDetailsPanel((v) => !v)}
                    title={t("Details & Notes")}
                  >
                    <User size={14} />
                    <span>{t("Details & Notes")}</span>
                  </button>

                  <button
                    type="button"
                    className="admin-chat-btn-action"
                    onClick={handleExportTranscript}
                    disabled={isExporting}
                    title={t("Export transcript")}
                  >
                    {isExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                    <span>{t("Export Transcript")}</span>
                  </button>

                  <button
                    type="button"
                    className={`admin-chat-btn-action ${
                      activeConversation?.status === "closed" ? "reopen" : "close"
                    }`}
                    onClick={handleToggleStatus}
                  >
                    {activeConversation?.status === "closed" ? (
                      <>
                        <Unlock size={14} />
                        <span>{t("Reopen Chat")}</span>
                      </>
                    ) : (
                      <>
                        <Lock size={14} />
                        <span>{t("Close Chat")}</span>
                      </>
                    )}
                  </button>
                </div>
              </header>

              {/* Message Thread (WhatsApp Styled) */}
              <div className="admin-chat-thread" ref={threadRef}>
                {messages.length === 0 && (
                  <div className="admin-chat-thread-empty">
                    <div className="admin-chat-thread-empty-icon">
                      <MessageSquare size={28} />
                    </div>
                    <h4>{t("No messages exchanged yet with this customer.")}</h4>
                    <p>{t("Type a message below or pick a quick reply to start the conversation.")}</p>
                  </div>
                )}

                {messages.map((msg, index) => {
                  const showDate =
                    index === 0 ||
                    new Date(msg.createdAt).toDateString() !==
                      new Date(messages[index - 1].createdAt).toDateString();
                  const isOutgoing = msg.senderType === "admin" || msg.senderType === "system";

                  return (
                    <div key={msg._id || msg.clientMessageId || index} className="admin-msg-item-wrap">
                      {showDate && (
                        <div className="admin-chat-date-pill">
                          <span>{formatMessageDate(msg.createdAt)}</span>
                        </div>
                      )}

                      <div className={`admin-msg-row ${isOutgoing ? "outgoing" : "incoming"}`}>
                        <div className={`admin-msg-bubble ${isOutgoing ? "outgoing" : "incoming"}`}>
                          <div className={`admin-msg-sender ${isOutgoing ? "outgoing" : "incoming"}`}>
                            {isOutgoing
                              ? msg.senderName || t("KhwabStitch Atelier")
                              : msg.senderName || activeConversation?.displayName || t("Customer")}
                          </div>

                          {msg.attachment?.url && (
                            <div
                              className="admin-msg-image-wrap"
                              onClick={() => setLightboxImage(msg.attachment.url)}
                              role="button"
                              tabIndex={0}
                              aria-label={t("View photo")}
                            >
                              <img
                                src={msg.attachment.url}
                                alt={t("Design reference")}
                                loading="lazy"
                              />
                            </div>
                          )}

                          {msg.content && <div className="admin-msg-text">{msg.content}</div>}

                          <div className="admin-msg-footer">
                            <span className="admin-msg-time">{formatMessageTime(msg.createdAt)}</span>
                            {isOutgoing && (
                              <span
                                className={`admin-msg-receipt ${
                                  msg.deliveryStatus === "read"
                                    ? "read"
                                    : msg.deliveryStatus === "delivered"
                                      ? "delivered"
                                      : "sent"
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
                    </div>
                  );
                })}

                {customerTyping && (
                  <div className="admin-msg-row incoming">
                    <div
                      className="admin-msg-bubble incoming typing-indicator-bubble"
                      aria-label={t("Customer is typing")}
                    >
                      <span className="admin-chat-typing-dot" />
                      <span className="admin-chat-typing-dot" />
                      <span className="admin-chat-typing-dot" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies Tray */}
              <div className="admin-chat-quick-bar">
                <div className="admin-chat-quick-chips">
                  {activeQuickReplies.map((reply, i) => (
                    <button
                      key={i}
                      type="button"
                      className="admin-chat-quick-chip"
                      onClick={() => setInputText(reply)}
                      title={t("Type your reply to customer…")}
                    >
                      <span>{reply}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="admin-chat-quick-gear-btn"
                  onClick={() => setShowQuickRepliesManager(true)}
                  title={t("Chat Automation & Quick Replies")}
                >
                  <Settings size={15} />
                  <span>{t("Settings")}</span>
                </button>
              </div>

              {/* Chat Automation & Quick Replies Modal */}
              {showQuickRepliesManager && (
                <div
                  className="admin-chat-modal-overlay"
                  onClick={() => setShowQuickRepliesManager(false)}
                >
                  <div
                    className="admin-chat-settings-modal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="admin-chat-settings-modal-header">
                      <div>
                        <h3>{t("Chat Automation & Quick Replies")}</h3>
                        <p>{t("Manage greetings, tailor replies, and customer question prompts.")}</p>
                      </div>
                      <button
                        type="button"
                        className="admin-chat-modal-close"
                        onClick={() => setShowQuickRepliesManager(false)}
                        aria-label={t("Close")}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Tabs */}
                    <div className="admin-chat-settings-tabs">
                      <button
                        type="button"
                        className={`admin-chat-settings-tab ${
                          settingsActiveTab === "greeting" ? "active" : ""
                        }`}
                        onClick={() => setSettingsActiveTab("greeting")}
                      >
                        {t("Auto-Greeting")}
                      </button>
                      <button
                        type="button"
                        className={`admin-chat-settings-tab ${
                          settingsActiveTab === "quickReplies" ? "active" : ""
                        }`}
                        onClick={() => setSettingsActiveTab("quickReplies")}
                      >
                        {t("Tailor Quick Replies")}
                      </button>
                      <button
                        type="button"
                        className={`admin-chat-settings-tab ${
                          settingsActiveTab === "customerPrompts" ? "active" : ""
                        }`}
                        onClick={() => setSettingsActiveTab("customerPrompts")}
                      >
                        {t("Customer Question Prompts")}
                      </button>
                    </div>

                    <div className="admin-chat-settings-body">
                      {settingsActiveTab === "greeting" && (
                        <div className="admin-chat-tab-panel">
                          <label className="admin-chat-toggle-label">
                            <input
                              type="checkbox"
                              checked={autoGreeting.enabled}
                              onChange={(e) =>
                                setAutoGreeting((prev) => ({
                                  ...prev,
                                  enabled: e.target.checked,
                                }))
                              }
                            />
                            <span>{t("Enable Auto-Greeting on first message")}</span>
                          </label>
                          <p className="admin-chat-field-hint">
                            {t(
                              "Send greeting automatically when a customer messages for the first time"
                            )}
                          </p>

                          <div className="admin-chat-field-group">
                            <label className="admin-chat-field-label">
                              {t("Greeting Message Text")}
                            </label>
                            <textarea
                              className="admin-chat-textarea"
                              rows={4}
                              value={autoGreeting.message}
                              onChange={(e) =>
                                setAutoGreeting((prev) => ({
                                  ...prev,
                                  message: e.target.value,
                                }))
                              }
                              maxLength={600}
                              placeholder={t("Type your message…")}
                            />
                            <div className="admin-chat-textarea-footer">
                              <button
                                type="button"
                                className="admin-chat-link-btn"
                                onClick={() =>
                                  setAutoGreeting({
                                    enabled: true,
                                    message:
                                      "Hello! Welcome to KhwabStitch Atelier. Thank you for reaching out! Please share the design or outfit you would like stitched, and our master craftsman will assist you shortly.",
                                  })
                                }
                              >
                                {t("Reset to default greeting")}
                              </button>
                              <span>{autoGreeting.message?.length || 0}/600</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {settingsActiveTab === "quickReplies" && (
                        <div className="admin-chat-tab-panel">
                          <p className="admin-chat-field-hint">
                            {t("Tailor Quick Replies")}
                          </p>
                          <div className="admin-chat-quick-list">
                            {activeQuickReplies.map((reply, idx) => (
                              <div key={idx} className="admin-chat-quick-item">
                                <span>{reply}</span>
                                <button
                                  type="button"
                                  className="admin-chat-quick-del-btn"
                                  onClick={() => handleDeleteQuickReply(idx)}
                                  title={t("Delete")}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <form
                            onSubmit={handleAddQuickReply}
                            className="admin-chat-quick-add-form"
                          >
                            <input
                              type="text"
                              className="admin-chat-search-input"
                              placeholder={t("Add a new quick reply…")}
                              value={newQuickReplyText}
                              onChange={(e) => setNewQuickReplyText(e.target.value)}
                              maxLength={300}
                            />
                            <button
                              type="submit"
                              className="admin-chat-btn-send"
                              disabled={!newQuickReplyText.trim()}
                            >
                              <Plus size={14} />
                              <span>{t("Add")}</span>
                            </button>
                          </form>
                        </div>
                      )}

                      {settingsActiveTab === "customerPrompts" && (
                        <div className="admin-chat-tab-panel">
                          <p className="admin-chat-field-hint">
                            {t(
                              "These prompt chips appear inside the customer chat widget so customers can ask with one tap."
                            )}
                          </p>
                          <div className="admin-chat-quick-list">
                            {customerPrompts.map((prompt, idx) => (
                              <div key={idx} className="admin-chat-quick-item">
                                <span>{prompt}</span>
                                <button
                                  type="button"
                                  className="admin-chat-quick-del-btn"
                                  onClick={() => handleDeleteCustomerPrompt(idx)}
                                  title={t("Delete")}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <form
                            onSubmit={handleAddCustomerPrompt}
                            className="admin-chat-quick-add-form"
                          >
                            <input
                              type="text"
                              className="admin-chat-search-input"
                              placeholder={t("Add a new customer prompt…")}
                              value={newCustomerPromptText}
                              onChange={(e) => setNewCustomerPromptText(e.target.value)}
                              maxLength={120}
                            />
                            <button
                              type="submit"
                              className="admin-chat-btn-send"
                              disabled={!newCustomerPromptText.trim()}
                            >
                              <Plus size={14} />
                              <span>{t("Add")}</span>
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                    <div className="admin-chat-settings-footer">
                      {settingsSuccessNotice && (
                        <span className="admin-chat-success-notice">
                          {settingsSuccessNotice}
                        </span>
                      )}
                      <button
                        type="button"
                        className="admin-chat-save-settings-btn"
                        onClick={handleSaveAllSettings}
                        disabled={isSavingQuickReplies}
                      >
                        {isSavingQuickReplies ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Save size={15} />
                        )}
                        <span>{t("Save Chat Settings")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Composer */}
              <footer className="admin-chat-composer">
                <form className="admin-chat-composer-row" onSubmit={handleSendMessage}>
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
                    aria-label={t("Attach photo")}
                    title={t("Attach photo")}
                  >
                    {isUploading ? (
                      <Loader2 size={18} className="spin" />
                    ) : (
                      <Paperclip size={18} />
                    )}
                  </button>

                  <textarea
                    className="admin-chat-textarea"
                    rows={1}
                    placeholder={t("Type your reply to customer\u2026")}
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
                    className="admin-chat-btn-send"
                    disabled={!inputText.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>{t("Send")}</span>
                  </button>
                </form>
              </footer>
            </>
          ) : (
            <div className="admin-chat-empty-view">
              <div className="admin-chat-empty-icon">
                <MessageSquare size={48} strokeWidth={1.5} />
              </div>
              <h3>{t("KhwabStitch Atelier Customer Messaging")}</h3>
              <p>
                {t(
                  "Choose a customer conversation from the left sidebar to start replying in real time, inspect measurement references, or update private tailor notes."
                )}
              </p>
              <div className="admin-chat-empty-features">
                <div className="admin-chat-empty-feature">
                  <CheckCheck size={16} />
                  <span>{t("Real-time delivery receipts")}</span>
                </div>
                <div className="admin-chat-empty-feature">
                  <Lock size={16} />
                  <span>{t("Private tailor notes")}</span>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Column 3: Customer Details Panel */}
        {selectedCustomerId && activeConversation && showDetailsPanel && (
          <aside className="admin-chat-details-panel">
            <header className="admin-chat-details-header">
              <h4>{t("Customer Details")}</h4>
              <button
                type="button"
                className="khwab-chat-header-btn"
                onClick={() => setShowDetailsPanel(false)}
                title={t("Close")}
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
            </header>
            <section className="admin-chat-detail-section">
              <div className="admin-chat-detail-item">
                <span className="admin-chat-detail-label">{t("Customer ID")}</span>
                <span className="admin-chat-detail-val">{selectedCustomerId}</span>
              </div>
              <div className="admin-chat-detail-item">
                <span className="admin-chat-detail-label">{t("Name")}</span>
                <span className="admin-chat-detail-val">
                  {activeConversation.displayName || t("Guest Customer")}
                </span>
              </div>
              <div className="admin-chat-detail-item">
                <span className="admin-chat-detail-label">{t("Status")}</span>
                <span className="admin-chat-detail-val">
                  {activeConversation.status === "closed" ? t("Closed") : t("Active")}
                </span>
              </div>
            </section>

            {activeConversation.relatedOrderReference && (
              <section className="admin-chat-detail-section">
                <h4>{t("Linked Order")}</h4>
                <div className="admin-chat-order-card">
                  <span>{t("Order reference:")}</span>
                  <strong>{activeConversation.relatedOrderReference}</strong>
                  <Link
                    to={`/admin/orders/${activeConversation.relatedOrderReference}`}
                    className="admin-chat-order-link"
                  >
                    {t("View Order Details")}
                    <ExternalLink size={13} />
                  </Link>
                </div>
              </section>
            )}

            <section className="admin-chat-detail-section">
              <h4>{t("Customer Notes")}</h4>
              <textarea
                className="admin-chat-notes-textarea"
                placeholder={t("Private notes about customer preferences, fabric, or sizing\u2026")}
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
              />
              <button
                type="button"
                className="admin-chat-btn-action"
                style={{ marginTop: "8px", width: "100%", justifyContent: "center" }}
                disabled={isSavingNotes}
                onClick={handleSaveNotes}
              >
                {isSavingNotes ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Save size={14} />
                )}
                {t("Save Notes")}
              </button>
            </section>
          </aside>
        )}
      </div>

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
          <img src={lightboxImage} alt={t("Enlarged design reference")} />
        </div>
      )}
    </div>
  );
}
