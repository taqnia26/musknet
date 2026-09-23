import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { CheckCheck, Check, MessageCircle, Search, Send, Edit2, AlertCircle, Loader2, ArrowRight, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { getAdminToken } from "@/lib/auth-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useGetAdminMe } from "@workspace/api-client-react";
import { hasPermission } from "@/lib/permissions";

type Chat = {
  jid: string;
  name: string;
  manualName: string | null;
  phone: string;
  unread: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
};

type Message = {
  id: string;
  chatJid: string;
  text: string;
  fromMe: boolean;
  timestamp: string;
  status: string;
};

const api = async (path: string, init?: RequestInit) => {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken() ?? ""}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let errorMsg = "Request failed";
    try {
      const data = await response.json();
      if (data && typeof data === "object" && "error" in data) {
        errorMsg = String(data.error);
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }
  return response.json();
};

export default function AdminWhatsAppInbox() {
  const { lang, t } = useLanguage();
  const { toast } = useToast();

  const { data: user } = useGetAdminMe();
  const canEdit = user ? hasPermission(user, "customer-service", "edit") : false;

  const [status, setStatus] = useState("disconnected");
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const selectedJidRef = useRef<string | null>(null);
  selectedJidRef.current = selectedJid;
  const [messages, setMessages] = useState<Message[]>([]);

  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Edit Name
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Scroll Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const hasScrolledForJid = useRef<string | null>(null);

  const selectedChat = useMemo(
    () => chats.find((c) => c.jid === selectedJid) || null,
    [chats, selectedJid]
  );

  const refresh = async () => {
    try {
      const state = await api("/admin/whatsapp/status");
      setStatus(state.status);
      if (state.connected) {
        const nextChats: Chat[] = await api("/admin/whatsapp/chats");
        setChats(nextChats);
      }
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("تعذر تحميل واتساب", "Could not load WhatsApp");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedJid) {
      setMessages([]);
      setIsMessagesLoading(false);
      return;
    }

    let active = true;
    let latestRequest = 0;
    const load = async () => {
      const requestId = ++latestRequest;
      try {
        const msgs = await api(`/admin/whatsapp/chats/${encodeURIComponent(selectedJid)}/messages`);
        if (!active || requestId !== latestRequest) return;
        setMessages((previous) =>
          previous.length === msgs.length && previous.every((message, index) =>
            message.id === msgs[index].id && message.status === msgs[index].status) ? previous : msgs);
        setMessagesError(null);
      } catch (cause) {
        if (active && requestId === latestRequest) setMessagesError(cause instanceof Error ? cause.message : t("تعذر تحميل الرسائل", "Could not load messages"));
      }
    };

    setMessages([]);
    setMessagesError(null);
    setIsMessagesLoading(true);
    void load().finally(() => { if (active) setIsMessagesLoading(false); });

    const timer = window.setInterval(() => void load(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedJid, t]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  const scrollToBottom = (behavior: "smooth" | "auto" = "auto") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    isNearBottom.current = true;
  }, [selectedJid]);

  useEffect(() => {
    if (messages.length > 0) {
      if (hasScrolledForJid.current !== selectedJid) {
        scrollToBottom("auto");
        hasScrolledForJid.current = selectedJid;
      } else if (isNearBottom.current) {
        scrollToBottom("auto");
      }
    }
  }, [messages, selectedJid]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();
    return chats.filter((chat) =>
      `${chat.name || ""} ${chat.phone || ""}`.toLowerCase().includes(term)
    );
  }, [chats, search]);

  const groupedMessages = useMemo(() => {
    const groups: { dateStr: string; messages: Message[] }[] = [];
    let currentDateStr = "";
    messages.forEach((msg) => {
      const dateStr = new Date(msg.timestamp).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (dateStr !== currentDateStr) {
        currentDateStr = dateStr;
        groups.push({ dateStr, messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    });
    return groups;
  }, [messages, lang]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedJid || !text.trim() || isSending) return;

    setIsSending(true);
    const sentText = text.trim();
    const jid = selectedJid;
    try {
      await api(`/admin/whatsapp/chats/${encodeURIComponent(jid)}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: sentText }),
      });
      if (jid === selectedJidRef.current) {
        setText("");
        isNearBottom.current = true;
      }
      // The polling loop refreshes messages; do not classify a successful send
      // as a failed send if the follow-up read happens to fail.
      try {
        const msgs = await api(`/admin/whatsapp/chats/${encodeURIComponent(jid)}/messages`);
        if (jid === selectedJidRef.current) setMessages(msgs);
      } catch { /* the next poll will retry */ }
      void refresh();
    } catch (cause) {
      toast({
        variant: "destructive",
        title: t("تعذر إرسال الرسالة", "Could not send message"),
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setIsSending(false);
    }
  };

  const openEditName = () => {
    if (!selectedChat) return;
    setEditNameValue(selectedChat.manualName || "");
    setIsEditingName(true);
  };

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedJid) return;
    setIsSavingName(true);
    try {
      const updated: Chat = await api(`/admin/whatsapp/chats/${encodeURIComponent(selectedJid)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editNameValue.trim() }),
      });
      setChats((current) => current.map((chat) => chat.jid === updated.jid ? updated : chat));
      setIsEditingName(false);
      void refresh();
      toast({ title: t("تم حفظ الاسم بنجاح", "Name saved successfully") });
    } catch (cause) {
      toast({
        variant: "destructive",
        title: t("تعذر حفظ الاسم", "Could not save name"),
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const getDisplayName = (chat: Chat) => {
    if (chat.name && chat.name.trim() !== "") return chat.name;
    return t("جهة اتصال بلا اسم", "Unnamed contact");
  };

  const getInitials = (name: string) => {
    if (name && name.trim() !== "") return name.trim().slice(0, 2).toUpperCase();
    return "?";
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    if (new Date().toDateString() === d.toDateString()) {
      return formatTime(isoString);
    }
    return d.toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-140px)] min-h-[500px] items-center justify-center rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>{t("جاري الاتصال بواتساب...", "Connecting to WhatsApp...")}</p>
        </div>
      </div>
    );
  }

  if (status !== "connected") {
    return (
      <div className="flex h-[calc(100vh-140px)] min-h-[500px] flex-col items-center justify-center rounded-2xl border bg-card p-10 text-center shadow-sm">
        <div className="rounded-full bg-destructive/10 p-6 mb-6">
          <AlertCircle className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight">{t("واتساب غير متصل", "WhatsApp is not connected")}</h2>
        <p className="mb-8 max-w-md text-muted-foreground leading-relaxed">
          {error ?? t("اربط الحساب من صفحة إعدادات واتساب ثم امسح رمز QR للمتابعة.", "Connect the account from WhatsApp settings, then scan the QR code to continue.")}
        </p>
        <Button size="lg" className="rounded-xl px-8" onClick={() => window.location.assign("/admin/whatsapp/settings")}>
          {t("فتح الإعدادات", "Open settings")}
        </Button>
      </div>
    );
  }

  return (
    <>
      {error && <div role="alert" className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t("تعذر تحديث المحادثات: ", "Could not refresh conversations: ")}{error}</div>}
      <div className="flex h-[calc(100vh-140px)] min-h-[500px] overflow-hidden rounded-2xl border shadow-sm ring-1 ring-border/50 bg-card/50" dir={lang === "ar" ? "rtl" : "ltr"}>
        <aside className={cn("flex flex-col border-e w-full md:w-[320px] lg:w-[380px] shrink-0 bg-card", selectedChat && "hidden md:flex")}>
          <div className="p-4 border-b bg-card">
            <h2 className="text-xl font-bold tracking-tight">{t("المحادثات", "Conversations")}</h2>
            <div className="mt-4 relative">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="ps-9 pe-8 bg-muted/50 border-transparent focus-visible:bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("ابحث عن محادثة...", "Search conversations...")}
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute end-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredChats.map((chat) => {
              const isSelected = selectedJid === chat.jid;
              return (
                <button
                  data-testid={`whatsapp-chat-${chat.jid}`}
                  key={chat.jid}
                  type="button"
                  onClick={() => setSelectedJid(chat.jid)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b p-4 text-start transition-colors duration-200 hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50",
                    isSelected ? "bg-primary/5 border-l-2 border-l-primary rtl:border-l-0 rtl:border-r-2 rtl:border-r-primary" : "bg-card border-l-2 border-l-transparent rtl:border-r-transparent"
                  )}
                >
                  <div className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-semibold transition-colors duration-200",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {getInitials(chat.name)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-bold">
                        {getDisplayName(chat)}
                      </span>
                      {chat.lastMessageAt && (
                        <span className={cn("shrink-0 text-[11px]", chat.unread > 0 ? "font-bold text-primary" : "text-muted-foreground")}>
                          {formatDate(chat.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    {chat.phone && <p dir="ltr" className="truncate text-start text-[11px] text-muted-foreground">{chat.phone}</p>}
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate text-sm", chat.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")} dir="auto">
                        {chat.lastMessage ?? (chat.phone || t("لا توجد رسائل", "No messages"))}
                      </p>
                      {chat.unread > 0 && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                          {chat.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {!filteredChats.length && (
              <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
                <MessageCircle className="mb-4 h-10 w-10 opacity-20" />
                <p className="text-sm">{search ? t("لا توجد نتائج للبحث", "No matching conversations") : t("لا توجد محادثات بعد", "No conversations yet")}</p>
              </div>
            )}
          </div>
        </aside>

        <main className={cn("flex-1 flex flex-col min-w-0 bg-muted/20 relative", !selectedChat && "hidden md:flex")} data-testid="whatsapp-message-panel">
          {selectedChat ? (
            <>
              <header className="z-10 flex h-[72px] shrink-0 items-center justify-between border-b bg-card px-4 shadow-sm md:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <Button variant="ghost" size="icon" aria-label={t("العودة للمحادثات", "Back to conversations")} className="-ms-2 md:hidden" onClick={() => setSelectedJid(null)}>
                      <ArrowRight className="h-5 w-5 ltr:rotate-180" />
                  </Button>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                     {getInitials(selectedChat.name)}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">
                        {getDisplayName(selectedChat)}
                      </span>
                      {canEdit && (
                        <Button data-testid="whatsapp-edit-name" variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full bg-muted/50 text-muted-foreground hover:text-foreground" onClick={openEditName} title={t("تعديل الاسم", "Edit Name")} aria-label={t("تعديل الاسم", "Edit name")}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {selectedChat.phone && (
                      <span className="truncate text-xs text-muted-foreground" dir="ltr">
                        {selectedChat.phone}
                      </span>
                    )}
                  </div>
                </div>
              </header>

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6"
              >
                {isMessagesLoading && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
                  </div>
                ) : messagesError && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-destructive">
                    <AlertCircle className="mr-2 h-5 w-5" />
                    <span>{messagesError}</span>
                  </div>
                ) : groupedMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("لا توجد رسائل في هذه المحادثة بعد", "No messages in this conversation yet")}</div>
                ) : (
                  groupedMessages.map((group, i) => (
                    <div key={i} className="space-y-4">
                      <div className="flex justify-center">
                        <span className="rounded-full bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                          {group.dateStr}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {group.messages.map((message) => (
                          <div key={message.id} className={cn("flex", message.fromMe ? "justify-end" : "justify-start")}>
                            <div className={cn(
                              "group relative max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm md:max-w-[75%]",
                              message.fromMe ? "rounded-br-sm bg-primary text-primary-foreground rtl:rounded-bl-sm rtl:rounded-br-2xl" : "rounded-bl-sm border bg-card text-card-foreground rtl:rounded-bl-2xl rtl:rounded-br-sm"
                            )}>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">{message.text}</p>
                              <div className={cn(
                                "mt-1.5 flex items-center justify-end gap-1.5 text-[10px]",
                                message.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                              )}>
                                <span>{formatTime(message.timestamp)}</span>
                                {message.fromMe && (
                                  message.status === "read" ? <CheckCheck className="h-[14px] w-[14px] text-blue-300 dark:text-blue-400" /> :
                                  message.status === "delivered" ? <CheckCheck className="h-[14px] w-[14px]" /> :
                                  message.status === "error" ? <AlertCircle className="h-[14px] w-[14px] text-red-400" /> :
                                  <Check className="h-[14px] w-[14px]" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {messagesError && messages.length > 0 && <div role="alert" className="border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">{t("تعذر تحديث الرسائل: ", "Could not refresh messages: ")}{messagesError}</div>}

              <form onSubmit={send} className="z-10 flex items-center gap-2 border-t bg-card p-3 shadow-sm md:p-4">
                <Input
                  data-testid="whatsapp-message-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={canEdit ? t("اكتب رسالة...", "Type a message...") : t("تحتاج صلاحية التعديل لإرسال الرسائل", "Edit permission is required to send messages")}
                  className="h-11 flex-1 rounded-xl border-transparent bg-muted/50 text-base shadow-sm focus-visible:bg-background"
                  dir="auto"
                  disabled={!canEdit}
                  aria-label={t("نص الرسالة", "Message text")}
                />
                <Button
                  data-testid="whatsapp-send-message"
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-xl shadow-none"
                   disabled={!canEdit || !text.trim() || isSending}
                   aria-label={t("إرسال الرسالة", "Send message")}
                >
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rtl:-scale-x-100" />}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
              <div className="mb-6 rounded-full bg-muted/50 p-6 ring-1 ring-border/50">
                <MessageCircle className="h-12 w-12 text-muted-foreground/40" />
              </div>
              <h3 className="mb-2 text-xl font-bold tracking-tight text-foreground/80">{t("رسائل واتساب", "WhatsApp Messages")}</h3>
              <p className="max-w-[250px] text-center text-sm">{t("اختر محادثة من القائمة لعرض الرسائل والرد على العميل.", "Choose a conversation to view messages and reply to the customer.")}</p>
            </div>
          )}
        </main>
      </div>

      <Dialog open={isEditingName} onOpenChange={setIsEditingName}>
        <DialogContent className="admin-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("تعديل اسم العميل", "Edit Customer Name")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveName} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label htmlFor="whatsapp-contact-name" className="text-sm font-medium">{t("الاسم الجديد", "New Name")}</label>
              <Input
                id="whatsapp-contact-name"
                data-testid="whatsapp-contact-name"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                maxLength={120}
                placeholder={t("اتركه فارغاً للحذف...", "Leave empty to clear...")}
                dir="auto"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsEditingName(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" disabled={isSavingName}>
                {isSavingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("حفظ التغييرات", "Save changes")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
