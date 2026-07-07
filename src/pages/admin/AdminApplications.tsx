import { useEffect, useState, useRef } from "react";
import { CheckCircle, XCircle, FileText, ChevronDown, ChevronUp, Loader2, ClipboardList, BadgeCheck, Clock, Search } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/auditLog";

// The generated Supabase types don't yet include the payment receipt columns.
const db = supabase as any;

const PAYMENT_BADGES: Record<string, { label: string; className: string }> = {
  uploaded:     { label: "Receipt Uploaded", className: "bg-blue-100 text-blue-700 border-blue-200" },
  verified:     { label: "Payment Verified", className: "bg-green-100 text-green-700 border-green-200" },
  rejected:     { label: "Receipt Rejected", className: "bg-red-100 text-red-700 border-red-200" },
  not_required: { label: "No Fee",           className: "bg-muted text-muted-foreground border-border" },
  unpaid:       { label: "Unpaid",           className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
};

const SERVICE_LABELS: Record<string, string> = {
  nba_diary:                 "NBA Diary",
  nba_id_card:               "NBA ID Card",
  apc:                       "Annual Practicing Certificate",
  letter_of_good_standing:   "Letter of Good Standing",
  stamp_seal:                "Stamp & Seal",
  title_document_front_page: "Title Document Front Page",
};

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const AdminApplications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [applications, setApplications] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<{ id: string; action: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rejection reason dialog
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: apps } = await supabase
        .from("service_applications")
        .select("*")
        .order("created_at", { ascending: false });

      const appList = apps || [];
      setApplications(appList);

      const userIds = [...new Set(appList.map((a) => a.user_id))];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, first_name, surname, email, phone")
          .in("user_id", userIds);
        const map: Record<string, any> = {};
        (profileData || []).forEach((p) => { map[p.user_id] = p; });
        setProfiles(map);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // search is applied at render time via `displayed` below
    }, 200);
  };

  const approve = async (app: any) => {
    if (app.payment_status === "uploaded" || app.payment_status === "rejected" || app.payment_status === "unpaid") {
      const ok = window.confirm("This application's payment has not been verified yet. Approve anyway?");
      if (!ok) return;
    }
    setUpdating({ id: app.id, action: "approved" });
    const { error } = await supabase.from("service_applications").update({ status: "approved" }).eq("id", app.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setUpdating(null); return; }

    const profile = profiles[app.user_id];
    const serviceLabel = SERVICE_LABELS[app.service_type] || app.service_type;
    const memberName = [profile?.surname, profile?.first_name].filter(Boolean).join(" ") || "Member";

    await supabase.from("notifications").insert({
      user_id: app.user_id,
      title: `Application Approved: ${serviceLabel}`,
      message: `Your application for ${serviceLabel} has been approved. Please collect at the branch office.`,
      type: "application_update",
    });

    let emailFailed = false;
    if (profile?.email) {
      const { error: emailError } = await supabase.functions.invoke("send-email", {
        body: { type: "application_approved", to: profile.email, name: memberName, service_type: serviceLabel },
      });
      if (emailError) emailFailed = true;
    }

    if (user) logAudit(user.id, "application_approved", "service_application", app.id, { service_type: app.service_type, member_email: profile?.email });

    setApplications((prev) => prev.map((a) => a.id === app.id ? { ...a, status: "approved" } : a));
    setUpdating(null);
    toast({
      title: "Application approved",
      description: emailFailed ? "Approved. In-app notification sent but email failed." : "The applicant has been notified.",
      variant: emailFailed ? "destructive" : "default",
    });
  };

  const openRejectDialog = (app: any) => {
    setRejectTarget(app);
    setRejectReason("");
  };

  // 'uploads' is a private bucket — public URLs 404, so mint a signed link.
  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("uploads").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Couldn't open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  // ── Payment receipt review ────────────────────────────────────────────────
  const [payReviewing, setPayReviewing] = useState<string | null>(null);
  const [payRejectTarget, setPayRejectTarget] = useState<any | null>(null);
  const [payRejectReason, setPayRejectReason] = useState("");
  const [payRejecting, setPayRejecting] = useState(false);

  const verifyPayment = async (app: any) => {
    if (!user) return;
    setPayReviewing(app.id);
    const { error } = await db
      .from("service_applications")
      .update({ payment_status: "verified", payment_reviewed_by: user.id, payment_reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) {
      toast({ title: "Failed to verify payment", description: error.message, variant: "destructive" });
      setPayReviewing(null);
      return;
    }

    const serviceLabel = SERVICE_LABELS[app.service_type] || app.service_type;
    await supabase.from("notifications").insert({
      user_id: app.user_id,
      title: `Payment Verified: ${serviceLabel}`,
      message: `Your payment for ${serviceLabel} has been verified by the secretariat.`,
      type: "application_update",
    });
    logAudit(user.id, "service_payment_verified", "service_application", app.id, { service_type: app.service_type });

    setApplications((prev) => prev.map((a) => a.id === app.id
      ? { ...a, payment_status: "verified", payment_rejection_reason: null }
      : a));
    setPayReviewing(null);
    toast({ title: "Payment verified", description: "The member has been notified." });
  };

  const confirmRejectPayment = async () => {
    if (!payRejectTarget || !user) return;
    const app = payRejectTarget;
    const reason = payRejectReason.trim();
    setPayRejecting(true);
    const { error } = await db
      .from("service_applications")
      .update({ payment_status: "rejected", payment_rejection_reason: reason || null, payment_reviewed_by: user.id, payment_reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) {
      toast({ title: "Failed to reject payment", description: error.message, variant: "destructive" });
      setPayRejecting(false);
      return;
    }

    const serviceLabel = SERVICE_LABELS[app.service_type] || app.service_type;
    await supabase.from("notifications").insert({
      user_id: app.user_id,
      title: `Payment Receipt Not Accepted: ${serviceLabel}`,
      message: `The payment receipt for your ${serviceLabel} application was not accepted.${reason ? ` Reason: ${reason}.` : ""} Please upload a corrected receipt from My Applications.`,
      type: "application_update",
    });
    logAudit(user.id, "service_payment_rejected", "service_application", app.id, { service_type: app.service_type, reason: reason || null });

    setApplications((prev) => prev.map((a) => a.id === app.id
      ? { ...a, payment_status: "rejected", payment_rejection_reason: reason || null }
      : a));
    setPayRejecting(false);
    setPayRejectTarget(null);
    setPayRejectReason("");
    toast({ title: "Payment receipt rejected", description: "The member has been notified." });
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    const { error } = await supabase
      .from("service_applications")
      .update({ status: "rejected", rejection_reason: rejectReason.trim() || null })
      .eq("id", rejectTarget.id);

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setRejecting(false); return; }

    const profile = profiles[rejectTarget.user_id];
    const serviceLabel = SERVICE_LABELS[rejectTarget.service_type] || rejectTarget.service_type;
    const memberName = [profile?.surname, profile?.first_name].filter(Boolean).join(" ") || "Member";
    const reasonText = rejectReason.trim() ? ` Reason: ${rejectReason.trim()}.` : "";

    await supabase.from("notifications").insert({
      user_id: rejectTarget.user_id,
      title: `Application Not Approved: ${serviceLabel}`,
      message: `Your application for ${serviceLabel} could not be approved at this time.${reasonText} Please contact the branch secretariat for assistance.`,
      type: "application_update",
    });

    let emailFailed = false;
    if (profile?.email) {
      const { error: emailError } = await supabase.functions.invoke("send-email", {
        body: { type: "application_rejected", to: profile.email, name: memberName, service_type: serviceLabel, reason: rejectReason.trim() || undefined },
      });
      if (emailError) emailFailed = true;
    }

    if (user) logAudit(user.id, "application_rejected", "service_application", rejectTarget.id, { service_type: rejectTarget.service_type, member_email: profile?.email });

    setApplications((prev) => prev.map((a) => a.id === rejectTarget.id ? { ...a, status: "rejected", rejection_reason: rejectReason.trim() || null } : a));
    setRejecting(false);
    setRejectTarget(null);
    toast({
      title: "Application rejected",
      description: emailFailed ? "Rejected. In-app notification sent but email failed." : "The applicant has been notified.",
      variant: emailFailed ? "destructive" : "default",
    });
  };

  const statusFiltered = filter === "all" ? applications : applications.filter((a) => a.status === filter);
  const displayed = query.trim()
    ? statusFiltered.filter((a) => {
        const profile = profiles[a.user_id];
        const q = query.toLowerCase();
        return [
          profile?.first_name, profile?.surname, profile?.email,
          SERVICE_LABELS[a.service_type], a.service_type,
        ].some((v) => v?.toLowerCase().includes(q));
      })
    : statusFiltered;

  const counts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    approved: applications.filter((a) => a.status === "approved").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Applications</h1>
          <p className="text-muted-foreground mt-1">Review, approve, or reject member service applications.</p>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, email, or service type..."
              className="w-full pl-9 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
                {f} <span className="ml-1 opacity-70">({counts[f]})</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No applications found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayed.map((app) => {
              const profile = profiles[app.user_id];
              const isExpanded = expanded === app.id;
              const formData = app.form_data || {};

              return (
                <Card key={app.id} className="shadow-card">
                  <CardContent className="p-0">
                    <div
                      className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : app.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-card-foreground text-sm">
                            {SERVICE_LABELS[app.service_type] || app.service_type}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            app.status === "approved" ? "bg-green-100 text-green-800" :
                            app.status === "rejected" ? "bg-red-100 text-red-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {app.status}
                          </span>
                          {(() => {
                            const pb = PAYMENT_BADGES[app.payment_status] || PAYMENT_BADGES.unpaid;
                            const PIcon = app.payment_status === "verified" ? BadgeCheck : Clock;
                            return (
                              <Badge variant="outline" className={`gap-1 text-[10px] ${pb.className}`}>
                                <PIcon className="h-3 w-3" /> {pb.label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {profile
                            ? `${profile.surname || ""} ${profile.first_name || ""}`.trim() || profile.email
                            : app.user_id.slice(0, 8) + "..."}
                          {" · "}
                          {new Date(app.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          {profile?.email && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{profile.email}</p></div>}
                          {profile?.phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{profile.phone}</p></div>}
                          {app.payment_amount != null && (
                            <div>
                              <p className="text-xs text-muted-foreground">Fee</p>
                              <p className="font-medium">₦{Number(app.payment_amount).toLocaleString("en-NG")}</p>
                            </div>
                          )}
                        </div>

                        {/* Payment receipt review */}
                        {app.payment_status !== "not_required" && (
                          <div className={`rounded-md border px-4 py-3 ${
                            app.payment_status === "verified" ? "bg-green-50/60 border-green-100" :
                            app.payment_status === "rejected" ? "bg-red-50/60 border-red-100" :
                            "bg-blue-50/60 border-blue-100"
                          }`}>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bank Transfer Payment</p>
                                <p className="text-sm text-foreground mt-0.5">
                                  {app.payment_status === "verified"
                                    ? <>Verified</>
                                    : app.payment_status === "rejected"
                                    ? <>Receipt rejected{app.payment_rejection_reason && <> — {app.payment_rejection_reason}</>}</>
                                    : app.payment_status === "uploaded"
                                    ? "Transfer receipt awaiting verification."
                                    : "No receipt uploaded yet."}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {app.payment_receipt_url && (
                                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openFile(app.payment_receipt_url)}>
                                    <FileText className="h-3.5 w-3.5" /> View Receipt
                                  </Button>
                                )}
                                {app.payment_status === "uploaded" && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                                      disabled={payReviewing === app.id}
                                      onClick={() => verifyPayment(app)}
                                    >
                                      {payReviewing === app.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <CheckCircle className="h-3.5 w-3.5" />}
                                      Verify Payment
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-8 text-xs gap-1"
                                      disabled={payReviewing === app.id}
                                      onClick={() => { setPayRejectTarget(app); setPayRejectReason(""); }}
                                    >
                                      <XCircle className="h-3.5 w-3.5" /> Reject Receipt
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {Object.keys(formData).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Submitted Details</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {Object.entries(formData).map(([key, val]) => (
                                <div key={key} className="bg-muted/50 rounded px-3 py-2">
                                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                                  <p className="text-sm font-medium text-foreground">{String(val)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {app.file_urls?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Uploaded Files</p>
                            <div className="flex flex-wrap gap-2">
                              {app.file_urls.map((url: string, i: number) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => openFile(url)}
                                  className="flex items-center gap-1.5 text-xs bg-accent/10 text-primary border border-accent/30 px-3 py-1.5 rounded hover:bg-accent/20 transition-colors"
                                >
                                  <FileText className="h-3 w-3" /> File {i + 1}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {app.rejection_reason && (
                          <div className="bg-red-50 border border-red-100 rounded px-3 py-2">
                            <p className="text-xs font-semibold text-red-700 mb-0.5">Rejection Reason</p>
                            <p className="text-sm text-red-800">{app.rejection_reason}</p>
                          </div>
                        )}

                        <div className="flex gap-3 pt-1 flex-wrap">
                          {app.status !== "approved" && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              disabled={!!updating}
                              onClick={() => approve(app)}
                            >
                              {updating?.id === app.id && updating.action === "approved"
                                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                : <CheckCircle className="h-4 w-4 mr-1" />}
                              Approve
                            </Button>
                          )}
                          {app.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!!updating}
                              onClick={() => openRejectDialog(app)}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Reject
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Rejection reason dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Rejecting <span className="font-semibold text-foreground">{SERVICE_LABELS[rejectTarget?.service_type] || rejectTarget?.service_type}</span>.
              Provide a reason so the member knows what to fix.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Passport photo is unclear. Please resubmit with a clearer image."
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

      {/* Payment receipt rejection dialog */}
      <Dialog open={!!payRejectTarget} onOpenChange={(open) => { if (!open) setPayRejectTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Payment Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Rejecting the transfer receipt for{" "}
              <span className="font-semibold text-foreground">{SERVICE_LABELS[payRejectTarget?.service_type] || payRejectTarget?.service_type}</span>.
              The member will be asked to upload a corrected receipt; no receipt number is issued.
            </p>
            <textarea
              value={payRejectReason}
              onChange={(e) => setPayRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. The transfer amount does not match the service fee."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground">Optional, but strongly recommended.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRejectTarget(null)} disabled={payRejecting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRejectPayment} disabled={payRejecting}>
              {payRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminApplications;
