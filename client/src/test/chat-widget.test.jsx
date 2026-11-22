import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { CustomerChatWidget } from "../components/chat/CustomerChatWidget";
import { AdminChatDashboard } from "../pages/AdminChatDashboard";
import {
  getStoredChatSession,
  saveChatSession,
  clearChatSession,
} from "../lib/chat-socket";

// Mock the API library
vi.mock("../lib/api", () => ({
  api: vi.fn(async (path) => {
    if (path === "/chat/guest") {
      return {
        data: {
          customerId: "c_test123",
          guestToken: "test_token_hex_64_bytes",
          displayName: "Meera",
          conversationId: "conv_123",
        },
      };
    }
    if (path.startsWith("/chat/messages")) {
      return {
        data: {
          messages: [
            {
              _id: "m_1",
              clientMessageId: "c_1",
              senderType: "admin",
              content: "Hello from atelier!",
              createdAt: new Date().toISOString(),
              deliveryStatus: "read",
            },
          ],
        },
      };
    }
    if (path.startsWith("/admin/chat/conversations")) {
      return {
        data: {
          conversations: [
            {
              customerId: "c_test123",
              displayName: "Meera",
              status: "active",
              lastMessage: {
                content: "Looking for kurti stitching",
                senderType: "customer",
                createdAt: new Date().toISOString(),
              },
              unreadCountAdmin: 1,
            },
          ],
          pagination: { totalUnread: 1 },
        },
      };
    }
    return { data: {} };
  }),
}));

// Mock auth
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    user: { _id: "admin1", name: "Master Tailor", role: "admin", token: "jwt_tok" },
    profile: { role: "admin" },
  }),
}));

// Mock socket.io-client
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  })),
}));

describe("Customer Chat Widget & Session", () => {
  beforeEach(() => {
    clearChatSession();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("manages guest session storage correctly", () => {
    expect(getStoredChatSession()).toBeNull();

    const sample = {
      customerId: "c_guest_999",
      guestToken: "tok_secret_hex",
      displayName: "Ananya",
      conversationId: "conv_abc",
    };

    saveChatSession(sample);
    expect(getStoredChatSession()).toEqual(sample);

    clearChatSession();
    expect(getStoredChatSession()).toBeNull();
  });

  it("renders floating launcher and toggles open on click", async () => {
    render(
      <BrowserRouter>
        <CustomerChatWidget />
      </BrowserRouter>
    );

    const launcher = screen.getByLabelText(/Chat with KhwabStitch Atelier/i);
    expect(launcher).toBeInTheDocument();

    // Click to open
    await act(async () => {
      fireEvent.click(launcher);
    });

    // Chat modal should now be open
    expect(screen.getByRole("dialog", { name: /Customer Chat Window/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "KhwabStitch" })).toBeInTheDocument();
    expect(screen.getByText(/Welcome to KhwabStitch Atelier/i)).toBeInTheDocument();
  });

  it("responds to window custom event open-atelier-chat with order reference", async () => {
    render(
      <BrowserRouter>
        <CustomerChatWidget />
      </BrowserRouter>
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("open-atelier-chat", {
          detail: {
            orderCode: "KS-2026-0042",
            defaultMessage: "Hello, I have a question about my order.",
          },
        })
      );
    });

    // Chat window opened
    expect(screen.getByRole("dialog", { name: /Customer Chat Window/i })).toBeInTheDocument();
    expect(screen.getByText(/KS-2026-0042/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Type your message/i);
    expect(input.value).toBe("Hello, I have a question about my order.");
  });
});

describe("Admin Chat Dashboard", () => {
  it("renders conversation filters and conversation list", async () => {
    render(
      <BrowserRouter>
        <AdminChatDashboard />
      </BrowserRouter>
    );

    expect(screen.getByText(/Customer Chats/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search conversations/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Unread/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Active$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Closed$/i })).toBeInTheDocument();
  });

  it("allows selecting a customer conversation and viewing message composer", async () => {
    render(
      <BrowserRouter>
        <AdminChatDashboard />
      </BrowserRouter>
    );

    const convItem = await screen.findByText("Meera");
    expect(convItem).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(convItem);
    });

    expect(await screen.findByPlaceholderText(/Type your reply to customer/i)).toBeInTheDocument();
  });
});
