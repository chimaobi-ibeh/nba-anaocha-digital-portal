import { useEffect, useState } from "react";
import { CheckCircle, XCircle, FileText, Loader2, ScrollText, Clock, BadgeCheck } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/auditLog";

// The generated Supabase types don't yet include remuneration_receipts.
const db = supabase as any;

const STATUS_FILTERS = ["all", "uploaded", "verified", "rejected"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  uploaded: { label: "Awaiting Review", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  verified: { label: "Verified",        className: "bg-green-100 text-green-700 border-green-200", icon: BadgeCheck },
  rejected: { label: "Not Accepted",    className: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

const AdminRemuneration = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await db
      .from("remuneration_receipts")
      .select("*")
      .order("created_at", { ascending: false });
    const list = data || [];
    setRows(list);
    const userIds = [...new Set(list.map((r: any) => r.user_id))];
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, first_name, surname, email")
        .in("user_id", userIds as string[]);
      const map: Record<string, any> = {};
      (profileData || []).forEach((p) => { map[p.user_id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };

  const memberName = (uid: string) => {
    const p = profiles[uid];
    return [p?.surname, p?.first_name].filter(Boolean).join(" ") || p?.email || "Unknown member";
  };

  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("uploads").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Couldn't open receipt", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const verify = async (row: any) => {
    if (!user) return;
    setReviewing(row.id);
    // The register number is issued by a DB trigger on this transition.
    const { data: updated, error } = await db
      .from("remuneration_receipts")
      .update({ status: "verified", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("bin")
      .single();
    if (error) {
      toast({ title: "Failed to verify", description: error.message, variant: "destructive" });
      setReviewing(null);
      return;
    }
    await supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "Remuneration Verified",
      message: `Your remuneration receipt${row.description ? ` for ${row.description}` : ""} has been verified.${updated?.bin ? ` Your remuneration number is ${updated.bin}.` : ""}`,
      type: "remuneration",
    });
    logAudit(user.id, "remuneration_verified", "remuneration_receipt", row.id, { member: memberName(row.user_id), bin: updated?.bin ?? null });
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: "verified", bin: updated?.bin ?? r.bin, rejection_reason: null } : r));
    setReviewing(null);
    toast({ title: "Verified", description: updated?.bin ? `Remuneration number ${updated.bin} issued.` : "The member has been notified." });
  };

  const confirmReject = async () => {
    if (!rejectTarget || !user) return;
    const row = rejectTarget;
    const reason = rejectReason.trim();
    setRejecting(true);
    const { error } = await db
      .from("remuneration_receipts")
      .update({ status: "rejected", rejection_reason: reason || null, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
      setRejecting(false);
      return;
    }
    await supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "Remuneration Receipt Not Accepted",
      message: `Your remuneration receipt${row.description ? ` for ${row.description}` : ""} was not accepted.${reason ? ` Reason: ${reason}.` : ""} Please upload a corrected receipt.`,
      type: "remuneration",
    });
    logAudit(user.id, "remuneration_rejected", "remuneration_receipt", row.id, { member: memberName(row.user_id), reason: reason || null });
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: "rejected", rejection_reason: reason || null } : r));
    setRejecting(false);
    setRejectTarget(null);
    setRejectReason("");
    toast({ title: "Receipt rejected", description: "The member has been notified and can re-upload." });
  };

  const counts = {
    all: rows.length,
    uploaded: rows.filter((r) => r.status === "uploaded").length,
    verified: rows.filter((r) => r.status === "verified").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
  const displayed = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Document Remuneration</h1>
          <p className="text-muted-foreground mt-1">
            Review remuneration receipts for prepared documents. Verifying a receipt issues the next branch remuneration number.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f === "uploaded" ? "Awaiting Review" : f} <span className="ml-1 opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-10 text-center">
              <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No remuneration receipts{filter !== "all" ? ` (${filter})` : ""} yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayed.map((row) => {
              const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.uploaded;
              const BIcon = badge.icon;
              return (
                <Card key={row.id} className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground text-sm">{row.description || "Prepared Document"}</p>
                          {row.amount != null && (
                            <Badge variant="outline" className="text-[10px]">₦{Number(row.amount).toLocaleString("en-NG")}</Badge>
                          )}
                          <Badge variant="outline" className={`text-[10px] gap-1 ${badge.className}`}>
                            <BIcon className="h-3 w-3" /> {badge.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {memberName(row.user_id)}
                          {row.reference ? ` · ${row.reference}` : ""}
                          {" · "}
                          {new Date(row.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        {row.status === "verified" && row.bin && (
                          <p className="text-xs text-green-700 font-semibold mt-1.5">
                            Remuneration No: <span className="font-mono">{row.bin}</span>
                          </p>
                        )}
                        {row.status === "rejected" && row.rejection_reason && (
                          <p className="text-xs text-red-700 mt-1.5">Reason: {row.rejection_reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {row.receipt_url && (
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => viewReceipt(row.receipt_url)}>
                            <FileText className="h-3.5 w-3.5" /> View Receipt
                          </Button>
                        )}
                        {row.status === "uploaded" && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                              disabled={reviewing === row.id}
                              onClick={() => verify(row)}
                            >
                              {reviewing === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs gap-1"
                              disabled={reviewing === row.id}
                              onClick={() => { setRejectTarget(row); setRejectReason(""); }}
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Remuneration Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Rejecting the receipt from{" "}
              <span className="font-semibold text-foreground">{rejectTarget ? memberName(rejectTarget.user_id) : ""}</span>.
              They will be asked to upload a corrected receipt; no remuneration number is issued.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. The transfer amount does not match, or the receipt is unclear."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground">Optional, but strongly recommended.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejecting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={rejecting}>
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminRemuneration;
