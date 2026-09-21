import { useEffect, useMemo, useState } from "react";
import { CheckCheck, MessageCircle, Search, Send, UserCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { getAdminToken } from "@/lib/auth-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Chat = { jid: string; name: string; phone: string; unread: number; lastMessage: string | null; lastMessageAt: string | null };
type Message = { id: string; chatJid: string; text: string; fromMe: boolean; timestamp: string; status: string };
const api = async (path: string, init?: RequestInit) => {
  const response = await fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}`, ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Request failed");
  return response.json();
};

export default function AdminWhatsAppInbox() {
  const { lang, t } = useLanguage();
  const { toast } = useToast();
  const [status, setStatus] = useState("disconnected");
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    try {
      const state = await api("/admin/whatsapp/status"); setStatus(state.status);
      if (state.connected) {
        const nextChats: Chat[] = await api("/admin/whatsapp/chats");
        setChats(nextChats);
        setSelected((current) => current ? nextChats.find((chat) => chat.jid === current.jid) ?? null : null);
      } else { setChats([]); setSelected(null); setMessages([]); }
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("تعذر تحميل واتساب", "Could not load WhatsApp");
      setError(message);
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 4000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    const load = async () => { try { setMessages(await api(`/admin/whatsapp/chats/${encodeURIComponent(selected.jid)}/messages`)); } catch (cause) { toast({ variant: "destructive", title: t("تعذر تحميل الرسائل", "Could not load messages"), description: cause instanceof Error ? cause.message : undefined }); } };
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [selected, t, toast]);
  const filtered = useMemo(() => chats.filter((chat) => `${chat.name} ${chat.phone}`.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  const send = async (event: React.FormEvent) => { event.preventDefault(); if (!selected || !text.trim()) return; try { await api(`/admin/whatsapp/chats/${encodeURIComponent(selected.jid)}/messages`, { method: "POST", body: JSON.stringify({ text }) }); setText(""); setMessages(await api(`/admin/whatsapp/chats/${encodeURIComponent(selected.jid)}/messages`)); void refresh(); } catch (cause) { toast({ variant: "destructive", title: t("تعذر إرسال الرسالة", "Could not send message"), description: cause instanceof Error ? cause.message : undefined }); } };
  if (loading) return <div className="p-10 text-center text-muted-foreground">{t("جاري تحميل واتساب...", "Loading WhatsApp...")}</div>;
  if (status !== "connected") return <div className="mx-auto max-w-xl rounded-2xl border bg-card p-10 text-center"><MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary" /><h2 className="text-xl font-bold">{t("واتساب غير متصل", "WhatsApp is not connected")}</h2><p className="mt-2 text-muted-foreground">{error ?? t("اربط الحساب من صفحة إعدادات واتساب ثم امسح رمز QR.", "Connect the account from WhatsApp settings, then scan the QR code.")}</p><Button className="mt-6" onClick={() => window.location.assign("/admin/whatsapp/settings")}>{t("فتح الإعدادات", "Open settings")}</Button></div>;
  return <div className="h-[calc(100vh-14rem)] min-h-[560px] overflow-hidden rounded-xl border bg-card shadow-sm" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="flex h-full">
      <aside className={cn("w-full shrink-0 border-e md:w-80", selected && "hidden md:block")}>
        <div className="space-y-4 border-b p-4"><h2 className="font-bold text-lg">{t("المحادثات", "Conversations")}</h2><div className="relative"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ابحث عن محادثة", "Search conversations")} /></div></div>
        <ScrollArea className="h-[calc(100%-116px)]">{filtered.map((chat) => <button data-testid={`whatsapp-chat-${chat.jid}`} key={chat.jid} type="button" onClick={() => setSelected(chat)} className={cn("flex w-full items-start gap-3 border-b p-4 text-start hover:bg-muted/50", selected?.jid === chat.jid && "bg-primary/10")}><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{chat.name.slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><b className="truncate">{chat.name}</b><small className="text-muted-foreground">{chat.lastMessageAt && new Date(chat.lastMessageAt).toLocaleTimeString()}</small></div><p className="truncate text-sm text-muted-foreground">{chat.lastMessage ?? chat.phone}</p></div>{chat.unread > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{chat.unread}</span>}</button>)}{!filtered.length && <p className="p-8 text-center text-sm text-muted-foreground">{t("لا توجد محادثات بعد", "No conversations yet")}</p>}</ScrollArea>
      </aside>
      <main className={cn("flex min-w-0 flex-1 flex-col", !selected && "hidden md:flex")} data-testid="whatsapp-message-panel">{selected ? <><header className="flex items-center gap-3 border-b p-4"><Button variant="ghost" className="md:hidden" onClick={() => setSelected(null)}>←</Button><UserCircle2 className="h-8 w-8 text-primary" /><div><b>{selected.name}</b><div className="text-xs text-muted-foreground" dir="ltr">{selected.phone}</div></div></header><ScrollArea className="flex-1 p-4"><div className="mx-auto max-w-2xl space-y-3">{messages.map((message) => <div key={message.id} className={cn("flex", message.fromMe ? "justify-start" : "justify-end")}><div className={cn("max-w-[80%] rounded-2xl px-4 py-2", message.fromMe ? "bg-primary text-primary-foreground" : "border bg-background")}><p className="whitespace-pre-wrap text-sm">{message.text}</p><div className="mt-1 flex justify-end gap-1 text-[10px] opacity-70">{new Date(message.timestamp).toLocaleTimeString()} {message.fromMe && <CheckCheck className="h-3 w-3" />}</div></div></div>)}</div></ScrollArea><form onSubmit={send} className="flex gap-2 border-t p-3"><Input data-testid="whatsapp-message-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("اكتب رسالة...", "Type a message...")} /><Button data-testid="whatsapp-send-message" type="submit" size="icon" disabled={!text.trim()}><Send className="h-4 w-4" /></Button></form></> : <div className="m-auto text-center text-muted-foreground"><MessageCircle className="mx-auto mb-3 h-12 w-12 opacity-30" /><p>{t("اختر محادثة لعرض الرسائل", "Choose a conversation to view messages")}</p></div>}</main>
    </div>
  </div>;
}