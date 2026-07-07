import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { anaochaSidebarItems } from "@/lib/sidebarItems";

const NotificationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [notification, setNotification] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setLoading(false); return; }
        setNotification(data);
        setLoading(false);
        // Opening a notification counts as reading it.
        if (data && !data.read) {
          supabase.from("notifications").update({ read: true }).eq("id", data.id).then(() => {});
        }
      });
  }, [user, id]);

  return (
    <DashboardLayout title="NBA Anaocha" sidebarItems={anaochaSidebarItems}>
      <div className="max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link to="/anaocha/notifications">
            <ArrowLeft className="h-4 w-4 mr-1" /> All notifications
          </Link>
        </Button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <Card className="shadow-card"><CardContent className="p-8 text-center"><p className="text-sm text-destructive">{error}</p></CardContent></Card>
        ) : !notification ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Notification Not Found</h3>
              <p className="text-sm text-muted-foreground">It may have been removed, or the link is incorrect.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-card">
            <CardContent className="p-6 md:p-8">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {new Date(notification.created_at).toLocaleDateString("en-NG", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
              <h1 className="font-heading text-xl md:text-2xl font-bold text-foreground mt-2">
                {notification.title}
              </h1>
              {/* whitespace-pre-wrap keeps the sender's paragraphs and line breaks. */}
              <div className="text-[15px] text-foreground/85 leading-relaxed mt-5 whitespace-pre-wrap break-words">
                {notification.message}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default NotificationDetail;
