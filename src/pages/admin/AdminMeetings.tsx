import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit2, Check, X, CalendarDays, MapPin, Video, Users, ClipboardCheck, Search } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

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

interface Member {
  user_id: string;
  first_name: string | null;
  surname: string | null;
  email: string | null;
}

const emptyForm = { title: "", meeting_date: "", mode: "physical", venue: "", notes: "" };

const memberName = (m: Member) =>
  [m.surname, m.first_name].filter(Boolean).join(" ") || m.email || "Unknown member";

const AdminMeetings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Register dialog state
  const [registerMeeting, setRegisterMeeting] = useState<Meeting | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [registerLoading, setRegisterLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [meetingsRes, attendanceRes, membersRes] = await Promise.all([
      db.from("meetings").select("*").order("meeting_date", { ascending: false }),
      db.from("meeting_attendance").select("meeting_id"),
      supabase.from("profiles").select("user_id, first_name, surname, email").order("surname"),
    ]);
    if (meetingsRes.error) toast({ title: "Failed to load meetings", description: meetingsRes.error.message, variant: "destructive" });
    setMeetings(meetingsRes.data || []);
    const counts: Record<string, number> = {};
    (attendanceRes.data || []).forEach((row: { meeting_id: string }) => {
      counts[row.meeting_id] = (counts[row.meeting_id] || 0) + 1;
    });
    setAttendanceCounts(counts);
    setMembers(membersRes.data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.title.trim())        { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (!form.meeting_date)        { toast({ title: "Date is required", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      meeting_date: form.meeting_date,
      mode: form.mode,
      venue: form.venue.trim() || null,
      notes: form.notes.trim() || null,
      ...(editing ? {} : { created_by: user?.id }),
    };
    const { error } = editing
      ? await db.from("meetings").update(payload).eq("id", editing)
      : await db.from("meetings").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Failed to save", description: error.message, variant: "destructive" }); return; }
    cancel();
    toast({ title: editing ? "Meeting updated" : "Meeting created" });
    load();
  };

  const startEdit = (m: Meeting) => {
    setForm({
      title: m.title,
      meeting_date: m.meeting_date,
      mode: m.mode,
      venue: m.venue || "",
      notes: m.notes || "",
    });
    setEditing(m.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await db.from("meetings").delete().eq("id", id);
    if (error) { toast({ title: "Failed to delete", description: error.message, variant: "destructive" }); return; }
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    toast({ title: "Meeting deleted" });
  };

  const cancel = () => { setShowForm(false); setEditing(null); setForm({ ...emptyForm }); };

  // ─── Register marking ────────────────────────────────────────────────────
  const openRegister = async (m: Meeting) => {
    setRegisterMeeting(m);
    setSearch("");
    setRegisterLoading(true);
    const { data, error } = await db
      .from("meeting_attendance")
      .select("user_id")
      .eq("meeting_id", m.id);
    setRegisterLoading(false);
    if (error) { toast({ title: "Failed to load register", description: error.message, variant: "destructive" }); return; }
    setPresentIds(new Set((data || []).map((r: { user_id: string }) => r.user_id)));
  };

  const closeRegister = () => {
    if (registerMeeting) {
      setAttendanceCounts((prev) => ({ ...prev, [registerMeeting.id]: presentIds.size }));
    }
    setRegisterMeeting(null);
  };

  const togglePresent = async (memberId: string) => {
    if (!registerMeeting) return;
    const wasPresent = presentIds.has(memberId);
    // Optimistic update; revert on error.
    setPresentIds((prev) => {
      const next = new Set(prev);
      if (wasPresent) next.delete(memberId); else next.add(memberId);
      return next;
    });
    const { error } = wasPresent
      ? await db.from("meeting_attendance").delete().eq("meeting_id", registerMeeting.id).eq("user_id", memberId)
      : await db.from("meeting_attendance").insert({ meeting_id: registerMeeting.id, user_id: memberId, marked_by: user?.id });
    if (error) {
      setPresentIds((prev) => {
        const next = new Set(prev);
        if (wasPresent) next.add(memberId); else next.delete(memberId);
        return next;
      });
      toast({ title: "Failed to update register", description: error.message, variant: "destructive" });
    }
  };

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      memberName(m).toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Meetings</h1>
            <p className="text-muted-foreground mt-1">Create monthly branch meetings and mark the attendance register.</p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Meeting
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="shadow-card border-primary/30">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-heading font-semibold text-foreground">{editing ? "Edit Meeting" : "New Meeting"}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. July Monthly General Meeting" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Date</label>
                  <input type="date" value={form.meeting_date} onChange={(e) => setForm((p) => ({ ...p, meeting_date: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Mode</label>
                  <select value={form.mode} onChange={(e) => setForm((p) => ({ ...p, mode: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="physical">Physical</option>
                    <option value="virtual">Virtual</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">{form.mode === "virtual" ? "Platform / Link" : "Venue"}</label>
                  <input type="text" value={form.venue} onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
                    placeholder={form.mode === "virtual" ? "e.g. Zoom" : "e.g. Chief Charles Obegolu Bar Centre"} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Agenda or any remarks" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Check className="h-4 w-4 mr-1" />{saving ? "Saving..." : editing ? "Update" : "Create Meeting"}
                </Button>
                <Button variant="outline" onClick={cancel}><X className="h-4 w-4 mr-1" />Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No meetings yet. Create the first monthly meeting.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {meetings.map((m) => (
              <Card key={m.id} className="shadow-card">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-card-foreground">{m.title}</p>
                      <Badge variant={m.mode === "virtual" ? "secondary" : "default"} className="gap-1">
                        {m.mode === "virtual" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {m.mode === "virtual" ? "Virtual" : "Physical"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(`${m.meeting_date}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
                      {m.venue && <> · {m.venue}</>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Users className="h-3 w-3" /> {attendanceCounts[m.id] || 0} of {members.length} present
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openRegister(m)}>
                      <ClipboardCheck className="h-4 w-4 mr-1" /> Register
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(m)}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Attendance register dialog */}
      <Dialog open={!!registerMeeting} onOpenChange={(open) => !open && closeRegister()}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              Register — {registerMeeting?.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Tick every member who attended. {presentIds.size} of {members.length} marked present.
          </p>
          <div className="relative">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex-1 overflow-y-auto -mx-2 px-2">
            {registerLoading ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No members match your search.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredMembers.map((m) => {
                  const present = presentIds.has(m.user_id);
                  return (
                    <li key={m.user_id}>
                      <label className="flex items-center gap-3 px-2 py-2.5 cursor-pointer hover:bg-muted/50 rounded-md">
                        <input
                          type="checkbox"
                          checked={present}
                          onChange={() => togglePresent(m.user_id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">{memberName(m)}</span>
                          {m.email && <span className="block text-xs text-muted-foreground truncate">{m.email}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="pt-2 border-t border-border">
            <Button className="w-full" onClick={closeRegister}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminMeetings;
