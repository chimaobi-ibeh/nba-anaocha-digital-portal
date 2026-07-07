import { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Video, CheckCircle2, XCircle, Clock } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { anaochaSidebarItems } from "@/lib/sidebarItems";

// The generated Supabase types don't yet include the meetings tables.
const db = supabase as any;

interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  mode: "physical" | "virtual";
  venue: string | null;
  notes: string | null;
}

const Meetings = () => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      db.from("meetings").select("*").order("meeting_date", { ascending: false }),
      db.from("meeting_attendance").select("meeting_id").eq("user_id", user.id),
    ]).then(([meetingsRes, attendanceRes]: any[]) => {
      if (meetingsRes.error) { setError(meetingsRes.error.message); setLoading(false); return; }
      setMeetings(meetingsRes.data || []);
      setAttendedIds(new Set((attendanceRes.data || []).map((r: { meeting_id: string }) => r.meeting_id)));
      setLoading(false);
    });
  }, [user]);

  // Attendance rate counts only meetings that have already held this year —
  // upcoming meetings can't be attended yet and shouldn't drag the rate down.
  const { yearHeld, yearAttended, rate } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const year = String(new Date().getFullYear());
    const held = meetings.filter((m) => m.meeting_date <= today && m.meeting_date.startsWith(year));
    const attended = held.filter((m) => attendedIds.has(m.id));
    return {
      yearHeld: held.length,
      yearAttended: attended.length,
      rate: held.length > 0 ? Math.round((attended.length / held.length) * 100) : null,
    };
  }, [meetings, attendedIds]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardLayout title="NBA Anaocha" sidebarItems={anaochaSidebarItems}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Branch Meetings</h1>
          <p className="text-muted-foreground mt-1">Monthly meetings of the branch and your attendance record.</p>
        </div>

        {/* Attendance summary */}
        {!loading && !error && yearHeld > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card">
              <CardContent className="p-5">
                <p className="text-2xl font-bold text-foreground">{yearHeld}</p>
                <p className="text-sm text-muted-foreground">Meeting{yearHeld !== 1 ? "s" : ""} held this year</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-5">
                <p className="text-2xl font-bold text-foreground">{yearAttended}</p>
                <p className="text-sm text-muted-foreground">Attended by you</p>
              </CardContent>
            </Card>
            <Card className={`shadow-card ${rate !== null && rate >= 75 ? "border-green-200 bg-green-50/40" : ""}`}>
              <CardContent className="p-5">
                <p className="text-2xl font-bold text-foreground">{rate}%</p>
                <p className="text-sm text-muted-foreground">Your attendance rate</p>
              </CardContent>
            </Card>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <Card className="shadow-card"><CardContent className="p-8 text-center"><p className="text-sm text-destructive">{error}</p></CardContent></Card>
        ) : meetings.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">No Meetings Yet</h3>
              <p className="text-sm text-muted-foreground">Branch meetings will appear here once they are scheduled.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => {
              const upcoming = m.meeting_date > today;
              const attended = attendedIds.has(m.id);
              return (
                <Card key={m.id} className="shadow-card">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-card-foreground">{m.title}</p>
                        <Badge variant={m.mode === "virtual" ? "secondary" : "outline"} className="gap-1">
                          {m.mode === "virtual" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                          {m.mode === "virtual" ? "Virtual" : "Physical"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(`${m.meeting_date}T00:00:00`).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        {m.venue && <> · {m.venue}</>}
                      </p>
                      {m.notes && <p className="text-xs text-muted-foreground mt-1">{m.notes}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {upcoming ? (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" /> Upcoming
                        </Badge>
                      ) : attended ? (
                        <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                          <CheckCircle2 className="h-3 w-3" /> Present
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" /> Absent
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Meetings;
