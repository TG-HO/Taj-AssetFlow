'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell, BellOff, Check, Star, CheckCircle, AlertTriangle, Loader2, ArrowRight, Flag
} from 'lucide-react';
import { getNotifications, markNotificationRead, toggleNotificationImportant, markAllNotificationsRead } from './actions';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useTenantSession();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'important'>('all');

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    const res = await getNotifications();
    if (res.success) {
      setNotifications(res.data);
    } else {
      toast(res.error || 'Failed to fetch notifications.', 'error');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string, currentRead: boolean) => {
    const res = await markNotificationRead(id, !currentRead);
    if (res.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: !currentRead } : n));
    } else {
      toast(res.error || 'Failed to update notification.', 'error');
    }
  };

  const handleToggleImportant = async (id: string, currentImportant: boolean) => {
    const res = await toggleNotificationImportant(id, currentImportant);
    if (res.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_important: !currentImportant } : n));
    } else {
      toast(res.error || 'Failed to toggle importance.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    setIsLoading(true);
    const res = await markAllNotificationsRead();
    setIsLoading(false);
    if (res.success) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast('All notifications marked as read.', 'success');
    } else {
      toast(res.error || 'Failed to update notifications.', 'error');
    }
  };

  const handleNotificationClick = async (n: any) => {
    if (!n.is_read) {
      await markNotificationRead(n.id, true);
    }
    if (n.redirect_url) {
      router.push(n.redirect_url);
    } else {
      fetchNotifications();
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'important') return n.is_important;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Bell className="h-8 w-8 text-primary" /> Notifications
          </h2>
          <p className="text-muted-foreground mt-1">
            Stay updated with inventory allocations, site requests, and branch activity alerts.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={handleMarkAllRead} variant="outline" className="gap-1.5 hover:bg-primary/10">
            <Check className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 border-b pb-1">
        {(['all', 'unread', 'important'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 transition-all capitalize -mb-px",
              filter === tab
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
            {tab === 'unread' && unreadCount > 0 && (
              <Badge className="ml-1.5 px-1.5 py-0 bg-primary text-primary-foreground font-bold text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <Card className="border border-muted/50 shadow-sm overflow-hidden bg-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-2" />
              <span className="text-sm text-muted-foreground">Loading notification feed...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground">
              <BellOff className="h-12 w-12 mx-auto text-muted/30 mb-3" />
              <p className="font-semibold text-lg">No notifications found</p>
              <p className="text-sm">You are completely caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-muted/40">
              {filtered.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-4 px-6 py-4.5 transition-colors cursor-pointer hover:bg-muted/10",
                    !n.is_read ? "bg-primary/[0.02]" : ""
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="shrink-0 mt-1">
                    {n.is_important ? (
                      <div className="h-9 w-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <Bell className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <p className={cn("text-sm font-semibold truncate", !n.is_read ? "text-foreground font-bold" : "text-muted-foreground")}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(n.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={cn("text-xs leading-relaxed max-w-2xl", !n.is_read ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {n.message}
                    </p>
                    {n.redirect_url && (
                      <span className="text-[10px] text-primary font-bold flex items-center gap-1.5 mt-1">
                        Go to action <ArrowRight size={11} />
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 self-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggleImportant(n.id, n.is_important)}
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center border transition-all hover:bg-muted",
                        n.is_important
                          ? "bg-destructive/10 border-destructive/20 text-destructive"
                          : "border-muted text-muted-foreground"
                      )}
                      title={n.is_important ? "Mark Unimportant" : "Mark Important"}
                    >
                      <Flag className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleMarkRead(n.id, n.is_read)}
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center border transition-all hover:bg-muted",
                        n.is_read
                          ? "border-muted text-muted-foreground"
                          : "bg-emerald-50 border-emerald-200 text-emerald-600"
                      )}
                      title={n.is_read ? "Mark Unread" : "Mark Read"}
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
