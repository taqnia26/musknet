import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { 
  Search, 
  MoreVertical, 
  Phone, 
  Paperclip, 
  Send, 
  Check, 
  CheckCheck,
  Archive,
  UserCircle2,
  Filter,
  Mail,
  MapPin,
  PackageCheck,
  Tag,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

type ChatStatus = 'open' | 'closed' | 'archived';
interface Chat {
  id: string;
  name: string;
  phone: string;
  unread: number;
  status: ChatStatus;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  email: string;
  cityAr: string;
  cityEn: string;
  lastOrder: string;
  tags: string[];
}

interface Message {
  id: string;
  text: string;
  isAgent: boolean;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

const mockChats: Chat[] = [
  { id: '1', name: 'أحمد محمد', phone: '+966500000001', unread: 2, status: 'open', avatar: 'AM', lastMessage: 'متى يصل الطلب؟', timestamp: '10:30 AM', email: 'ahmad@example.com', cityAr: 'الرياض', cityEn: 'Riyadh', lastOrder: 'ME-1048', tags: ['VIP', 'Retail'] },
  { id: '2', name: 'سارة خالد', phone: '+966500000002', unread: 0, status: 'open', avatar: 'SK', lastMessage: 'شكراً لكم، استلمت الشحنة.', timestamp: '09:15 AM', email: 'sara@example.com', cityAr: 'جدة', cityEn: 'Jeddah', lastOrder: 'ME-1041', tags: ['Repeat'] },
  { id: '3', name: 'محمد علي', phone: '+966500000003', unread: 1, status: 'open', avatar: 'MA', lastMessage: 'هل يوجد خصم للكميات؟', timestamp: 'الأمس', email: 'mohammed@example.com', cityAr: 'الدمام', cityEn: 'Dammam', lastOrder: 'B2B-218', tags: ['B2B'] },
  { id: '4', name: 'فاطمة عبدالله', phone: '+966500000004', unread: 0, status: 'archived', avatar: 'FA', lastMessage: 'تم الدفع', timestamp: 'الأمس', email: 'fatimah@example.com', cityAr: 'مكة', cityEn: 'Makkah', lastOrder: 'ME-1026', tags: ['Retail'] },
  { id: '5', name: 'عبدالرحمن صالح', phone: '+966500000005', unread: 0, status: 'closed', avatar: 'AS', lastMessage: 'يعطيكم العافية', timestamp: 'الإثنين', email: 'abdulrahman@example.com', cityAr: 'المدينة', cityEn: 'Madinah', lastOrder: 'ME-1014', tags: ['Resolved'] },
];

const mockMessages: Record<string, Message[]> = {
  '1': [
    { id: 'm1', text: 'مرحباً، لقد قمت بطلب قبل يومين.', isAgent: false, timestamp: '10:25 AM', status: 'read' },
    { id: 'm2', text: 'أهلاً بك أستاذ أحمد. جاري مراجعة طلبك.', isAgent: true, timestamp: '10:27 AM', status: 'read' },
    { id: 'm3', text: 'متى يصل الطلب؟', isAgent: false, timestamp: '10:30 AM', status: 'read' },
  ],
  '2': [
    { id: 'm1', text: 'هل يمكنني تغيير العنوان؟', isAgent: false, timestamp: '08:00 AM', status: 'read' },
    { id: 'm2', text: 'بالتأكيد، الرجاء تزويدنا بالعنوان الجديد.', isAgent: true, timestamp: '08:15 AM', status: 'read' },
    { id: 'm3', text: 'شكراً لكم، استلمت الشحنة.', isAgent: false, timestamp: '09:15 AM', status: 'read' },
  ]
};

export default function AdminWhatsAppInbox() {
  const { lang, t } = useLanguage();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>(mockChats);
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedChatId]);

  const filteredChats = chats.filter((chat) => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          chat.phone.includes(searchQuery);
    if (!matchesSearch) return false;
    
    if (activeTab === 'unread') return chat.unread > 0;
    if (activeTab === 'open') return chat.status === 'open';
    if (activeTab === 'archived') return chat.status === 'archived';
    return true;
  });

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const chatMessages = selectedChatId ? (messages[selectedChatId] || []) : [];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: t('واجهة تجريبية', 'Demo Interface'),
      description: t('لا يمكن إرسال الرسائل فعلياً عبر واتساب في هذه النسخة التجريبية.', 'Cannot send real WhatsApp messages in this demo version.'),
    });
  };

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const toggleArchive = () => {
    toast({
      title: t('واجهة تجريبية', 'Demo Interface'),
      description: t('الأرشفة معطلة في النسخة التجريبية.', 'Archiving is disabled in the demo version.'),
    });
  };

  const toggleClosed = () => {
    toast({
      title: t('واجهة تجريبية', 'Demo Interface'),
      description: t('إغلاق المحادثة معطل في النسخة التجريبية.', 'Closing conversation is disabled in the demo version.'),
    });
  };

  const handleAttachment = () => {
    toast({
      title: t('واجهة تجريبية', 'Demo Interface'),
      description: t('إرسال المرفقات معطل في النسخة التجريبية.', 'Sending attachments is disabled in the demo version.'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-primary/10 border border-primary/20 text-primary p-3 text-sm rounded-lg flex items-center justify-center font-medium gap-2">
        <Mail className="h-4 w-4" />
        {t('هذه واجهة تجريبية (صورية) لعرض تصميم صندوق الوارد. غير مربوطة حالياً بـ WhatsApp API.', 'This is a mock UI demonstrating the inbox design. It is not currently connected to the WhatsApp API.')}
      </div>
      <div className="h-[calc(100vh-14rem)] min-h-[560px] bg-card rounded-xl border flex overflow-hidden shadow-sm" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className={cn(
        "flex flex-col w-full md:w-72 lg:w-80 border-e shrink-0 transition-all duration-300",
        selectedChatId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">{t('رسائل الواتساب', 'WhatsApp Inbox')}</h2>
            <Button variant="ghost" size="icon" className="rounded-full">
              <MoreVertical className="w-5 h-5 text-muted-foreground" />
            </Button>
          </div>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <Input 
              placeholder={t('البحث عن جهة اتصال...', 'Search contacts...')}
              className="ps-9 h-10 bg-muted/50 border-transparent focus-visible:bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-auto p-1">
              <TabsTrigger value="all" className="text-xs py-1.5">{t('الكل', 'All')}</TabsTrigger>
              <TabsTrigger value="open" className="text-xs py-1.5">{t('مفتوح', 'Open')}</TabsTrigger>
              <TabsTrigger value="unread" className="text-xs py-1.5">{t('غير مقروء', 'Unread')}</TabsTrigger>
              <TabsTrigger value="archived" className="text-xs py-1.5">{t('مؤرشف', 'Archived')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredChats.length > 0 ? (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-1",
                    selectedChatId === chat.id ? "bg-primary/10" : "hover:bg-muted/50"
                  )}
                >
                  <Avatar className="w-12 h-12 border border-border/50">
                    <AvatarFallback className="bg-primary/5 text-primary font-semibold">
                      {chat.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm truncate">{chat.name} <span className="text-[10px] text-primary/70 mx-1">({t('عينة', 'Sample')})</span></span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ms-2">{chat.timestamp}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {chat.lastMessage}
                      </p>
                      {chat.unread > 0 && (
                        <Badge variant="default" className="h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full text-[10px]">
                          {chat.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Filter className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">{t('لا توجد محادثات', 'No chats found')}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className={cn(
        "flex-1 flex flex-col bg-muted/10 relative",
        !selectedChatId && "hidden md:flex items-center justify-center"
      )}>
        {!selectedChatId ? (
          <div className="text-center p-8 max-w-sm mx-auto">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <UserCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">{t('صندوق الوارد', 'Inbox')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('اختر محادثة من القائمة للبدء في المراسلة.', 'Select a chat from the list to start messaging.')}
            </p>
          </div>
        ) : (
          <>
            <div className="h-16 px-4 md:px-6 border-b bg-card flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden me-1"
                  onClick={() => setSelectedChatId(null)}
                >
                  <MoreVertical className="w-5 h-5 rotate-90 text-muted-foreground" />
                </Button>
                
                <Avatar className="w-10 h-10 border border-border/50">
                  <AvatarFallback className="bg-primary/10 text-primary">{selectedChat?.avatar}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-sm leading-none mb-1.5">{selectedChat?.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span dir="ltr">{selectedChat?.phone}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge className={cn(
                  selectedChat?.status === 'open' && 'bg-success/15 text-success',
                  selectedChat?.status === 'closed' && 'bg-destructive/25 text-destructive-foreground',
                  selectedChat?.status === 'archived' && 'bg-muted text-muted-foreground',
                )}>
                  {selectedChat?.status === 'open' ? t('مفتوح', 'Open') : selectedChat?.status === 'closed' ? t('مغلق', 'Closed') : t('مؤرشف', 'Archived')}
                </Badge>
                <Button variant="outline" size="sm" onClick={toggleArchive} className="hidden sm:flex">
                  <Archive className="w-4 h-4 me-2" />
                  {selectedChat?.status === 'archived' ? t('إلغاء الأرشيف', 'Unarchive') : t('أرشفة', 'Archive')}
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <MoreVertical className="w-5 h-5 text-muted-foreground" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4 md:p-6" style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundPosition: 'center center' }}>
              <div className="space-y-4 max-w-3xl mx-auto pb-4">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 text-sm">
                    {t('لا توجد رسائل سابقة', 'No previous messages')}
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isAgent = msg.isAgent;
                    return (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex flex-col w-full",
                          isAgent ? "items-start" : "items-end"
                        )}
                      >
                        <div 
                          className={cn(
                            "max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl relative shadow-sm",
                            isAgent 
                              ? "bg-primary text-primary-foreground rounded-tr-sm" 
                              : "bg-card text-card-foreground border rounded-tl-sm"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                          <div className={cn(
                            "flex items-center gap-1 mt-1.5 justify-end",
                            isAgent ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            <span className="text-[10px]">{msg.timestamp}</span>
                            {isAgent && (
                              msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5" /> :
                              msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5" /> :
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 md:p-4 border-t bg-card shrink-0">
              <form 
                onSubmit={handleSendMessage}
                className="flex items-end gap-2 max-w-4xl mx-auto"
              >
                <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full h-12 w-12 hover:bg-muted" onClick={handleAttachment} title={t('إرفاق تجريبي', 'Demo attachment')}>
                  <Paperclip className="w-5 h-5 text-muted-foreground" />
                </Button>
                
                <div className="flex-1 bg-muted/50 rounded-2xl border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-colors">
                  <Input 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={selectedChat?.status === 'closed' ? t('أعد فتح المحادثة للرد', 'Reopen the conversation to reply') : t('اكتب رسالة...', 'Type a message...')}
                    className="border-0 bg-transparent h-12 px-4 shadow-none focus-visible:ring-0"
                    autoComplete="off"
                    readOnly
                  />
                </div>
                
                <Button 
                  type="submit" 
                  size="icon" 
                  disabled={!newMessage.trim() || selectedChat?.status === 'closed'}
                  className="shrink-0 rounded-full h-12 w-12 shadow-sm transition-all"
                >
                  <Send className={cn("w-5 h-5", lang === 'ar' ? "rotate-180" : "")} />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {selectedChat && (
        <aside className="hidden xl:flex w-72 2xl:w-80 shrink-0 flex-col border-s bg-card">
          <div className="border-b p-5 text-center">
            <Avatar className="mx-auto h-20 w-20 border border-primary/30">
              <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">{selectedChat.avatar}</AvatarFallback>
            </Avatar>
            <h3 className="mt-3 font-bold">{selectedChat.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{selectedChat.phone}</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-5 text-sm">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('معلومات جهة الاتصال', 'Contact information')}</p>
                <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /><span className="truncate" dir="ltr">{selectedChat.email}</span></div>
                <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /><span>{lang === 'ar' ? selectedChat.cityAr : selectedChat.cityEn}</span></div>
                <div className="flex items-center gap-3"><PackageCheck className="h-4 w-4 text-primary" /><span>{t('آخر طلب', 'Last order')}: {selectedChat.lastOrder}</span></div>
              </div>
              <div className="border-t pt-5">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />{t('الوسوم', 'Tags')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedChat.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                </div>
              </div>
              <div className="border-t pt-5">
                <Button variant={selectedChat.status === 'closed' ? 'outline' : 'destructive'} className="w-full" onClick={toggleClosed}>
                  <XCircle className="me-2 h-4 w-4" />
                  {selectedChat.status === 'closed' ? t('إعادة فتح المحادثة', 'Reopen conversation') : t('إغلاق المحادثة', 'Close conversation')}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
    </div>
  );
}
