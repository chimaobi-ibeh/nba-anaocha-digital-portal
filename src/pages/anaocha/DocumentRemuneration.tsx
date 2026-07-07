import { useState, useEffect, useRef } from "react";
import { CheckCircle, Clock, Upload, X, FileText, ScrollText, Plus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import BankTransferDetails from "@/components/BankTransferDetails";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { anaochaSidebarItems } from "@/lib/sidebarItems";

// The generated Supabase types don't yet include remuneration_receipts.
const db = supabase as any;

type Receipt = {
  id: string;
  description: string | null;
  reference: string | null;
  amount: number | null;
  receipt_url: string | null;
  status: string;
  bin: string | null;
  rejection_reason: string | null;
  created_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; color: string; bg: string }> = {
  verified: { label: "Verified",        icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-100" },
  uploaded: { label: "Awaiting Review", icon: Clock,       color: "text-blue-600",  bg: "bg-blue-50 border-blue-100"   },
  rejected: { label: "Not Accepted",    icon: X,           color: "text-red-600",   bg: "bg-red-50 border-red-100"     },
};

const formatWithCommas = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("en-NG") : "";
};

const DocumentRemuneration = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reuploading, setReuploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reuploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await db
      .from("remuneration_receipts")
      .select("id, description, reference, amount, receipt_url, status, bin, rejection_reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setReceipts((data as Receipt[]) ?? []);
    setLoading(false);
  };

  const resetForm = () => {
    setAmount(""); setDescription(""); setReference(""); setFile(null);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!amount.replace(/\D/g, "")) {
      toast({ title: "Amount is required", description: "Enter the amount you paid.", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Receipt required", description: "Please upload your bank transfer receipt.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/remuneration/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("uploads").upload(path, file, { upsert: true });
    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }
    const { error } = await db.from("remuneration_receipts").insert({
      user_id: user.id,
      amount: Number(amount.replace(/\D/g, "")),
      description: description.trim() || null,
      reference: reference.trim() || null,
      receipt_url: path,
      status: "uploaded",
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      return;
    }
    resetForm();
    setShowForm(false);
    toast({ title: "Receipt submitted", description: "Your receipt is awaiting secretariat review." });
    load();
  };

  const handleReupload = async (receipt: Receipt, newFile: File) => {
    if (!user) return;
    setReuploading(receipt.id);
    const ext = newFile.name.split(".").pop();
    const existing = receipt.receipt_url;
    const folder = existing && existing.includes("/")
      ? existing.slice(0, existing.lastIndexOf("/"))
      : `${user.id}/remuneration/${crypto.randomUUID()}`;
    const path = `${folder}/receipt.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("uploads").upload(path, newFile, { upsert: true });
    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setReuploading(null);
      return;
    }
    const { error } = await db
      .from("remuneration_receipts")
      .update({ receipt_url: path, status: "uploaded" })
      .eq("id", receipt.id);
    setReuploading(null);
    if (error) {
      toast({ title: "Failed to resubmit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Receipt resubmitted", description: "Your new receipt is awaiting review." });
    load();
  };

  return (
    <DashboardLayout title="NBA Anaocha" sidebarItems={anaochaSidebarItems}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Document Remuneration</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Record remuneration paid on documents you have prepared. Pay by bank transfer,
              upload your receipt, and once the secretariat verifies it your transaction is
              assigned an official branch remuneration number.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> New Submission
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="shadow-card border-primary/30">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-heading font-semibold text-foreground">New Remuneration Submission</h2>

              <BankTransferDetails />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Amount Paid (₦) <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatWithCommas(amount)}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 10,000"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Document Prepared <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Deed of Assignment"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Party / Reference <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. client name or matter reference"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Bank Transfer Receipt <span className="text-destructive">*</span></label>
                <div className="mt-1.5">
                  {file ? (
                    <div className="flex items-center gap-2 text-sm bg-muted/60 border border-border px-3 py-2.5 rounded-md">
                      <FileText className="h-4 w-4 text-accent shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex flex-col items-center gap-1.5 border-2 border-dashed border-input rounded-md px-3 py-5 text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      <Upload className="h-5 w-5" />
                      <span>Click to upload</span>
                      <span className="text-xs opacity-60">PDF, JPG, PNG accepted</span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Receipt"}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-10 text-center">
              <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">No Submissions Yet</h3>
              <p className="text-sm text-muted-foreground">
                Submit a remuneration receipt for a prepared document to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {receipts.map((r) => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.uploaded;
              const Icon = cfg.icon;
              return (
                <Card key={r.id} className={`shadow-card border ${cfg.bg}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground text-sm">
                            {r.description || "Prepared Document"}
                          </p>
                          {r.amount != null && (
                            <Badge variant="outline" className="text-[10px]">₦{Number(r.amount).toLocaleString("en-NG")}</Badge>
                          )}
                        </div>
                        {r.reference && <p className="text-xs text-muted-foreground mt-1">{r.reference}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          Submitted {new Date(r.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        {r.status === "verified" && r.bin && (
                          <p className="text-xs text-green-700 font-semibold mt-2">
                            Remuneration No: <span className="font-mono">{r.bin}</span>
                          </p>
                        )}
                        {r.status === "rejected" && (
                          <div className="mt-2 bg-red-50 border border-red-100 rounded px-3 py-2">
                            <p className="text-xs font-semibold text-red-700 mb-0.5">Receipt not accepted{r.rejection_reason ? ":" : "."}</p>
                            {r.rejection_reason && <p className="text-xs text-red-800">{r.rejection_reason}</p>}
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 gap-1.5 h-8 text-xs"
                              disabled={reuploading === r.id}
                              onClick={() => reuploadRefs.current[r.id]?.click()}
                            >
                              {reuploading === r.id
                                ? <><span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Uploading...</>
                                : <><Upload className="h-3.5 w-3.5" />Upload Corrected Receipt</>}
                            </Button>
                            <input
                              ref={(el) => { reuploadRefs.current[r.id] = el; }}
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReupload(r, f); e.target.value = ""; }}
                            />
                          </div>
                        )}
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold shrink-0 ${cfg.color}`}>
                        <Icon className="h-4 w-4" />
                        {cfg.label}
                      </div>
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

export default DocumentRemuneration;
