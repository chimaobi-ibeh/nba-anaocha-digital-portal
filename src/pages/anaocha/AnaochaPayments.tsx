import { useState, useEffect } from "react";
import { Receipt, CheckCircle, Download } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { anaochaSidebarItems } from "@/lib/sidebarItems";
import { csvCell } from "@/lib/utils";
import { SERVICE_LABELS } from "@/lib/constants";

// The generated Supabase types don't yet include the payment receipt columns.
const db = supabase as any;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  uploaded: { label: "Awaiting Review", className: "text-blue-700 bg-blue-50 border-blue-200" },
  verified: { label: "Verified",        className: "text-green-700 bg-green-50 border-green-200" },
  rejected: { label: "Not Accepted",    className: "text-red-700 bg-red-50 border-red-200" },
};

type UnifiedPayment = {
  id:          string;
  type:        "service" | "dues";
  description: string;
  amount:      number | null;
  bin:         string | null;
  status:      string;
  created_at:  string;
};

const AnaochaPayments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<UnifiedPayment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const [serviceRes, duesRes] = await Promise.all([
      db.from("service_applications")
        .select("id, service_type, payment_amount, payment_status, bin, created_at")
        .eq("user_id", user.id)
        .in("payment_status", ["uploaded", "verified", "rejected"]),
      db.from("dues_payments")
        .select("id, amount, status, bin, paid_at, dues_items(title)")
        .eq("user_id", user.id)
        .not("paid_at", "is", null)
        .in("status", ["uploaded", "verified", "rejected"]),
    ]);

    if (serviceRes.error && duesRes.error) {
      setError(serviceRes.error.message);
      setLoading(false);
      return;
    }

    const servicePayments: UnifiedPayment[] = (serviceRes.data || []).map((r: any) => ({
      id:          r.id,
      type:        "service",
      description: SERVICE_LABELS[r.service_type] || "Service Payment",
      amount:      r.payment_amount != null ? Number(r.payment_amount) : null,
      bin:         r.bin,
      status:      r.payment_status,
      created_at:  r.created_at,
    }));

    const duesPayments: UnifiedPayment[] = (duesRes.data || []).map((r: any) => ({
      id:          r.id,
      type:        "dues",
      description: r.dues_items?.title || "Dues Payment",
      amount:      r.amount != null ? Number(r.amount) : null,
      bin:         r.bin,
      status:      r.status,
      created_at:  r.paid_at,
    }));

    const all = [...servicePayments, ...duesPayments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setPayments(all);
    setLoading(false);
  };

  const verified = payments.filter(p => p.status === "verified" && p.amount !== null);
  const total = verified.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const handleExportCSV = () => {
    const rows = [
      ["Type", "Description", "Amount (₦)", "Receipt No", "Status", "Date"],
      ...payments.map((p) => [
        p.type === "dues" ? "Dues" : "Service",
        p.description,
        p.amount !== null ? Number(p.amount).toFixed(2) : "-",
        p.bin || "-",
        STATUS_LABELS[p.status]?.label || p.status,
        new Date(p.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }),
      ]),
    ];
    const csv  = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `payment-history-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout title="NBA Anaocha" sidebarItems={anaochaSidebarItems}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Payment History</h1>
            <p className="text-muted-foreground mt-1">
              All payments submitted through the portal. Verified payments carry your official branch receipt number.
            </p>
          </div>
          {payments.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
        </div>

        {verified.length > 0 && (
          <Card className="shadow-card border-green-100 bg-green-50/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Verified</p>
                <p className="text-2xl font-bold text-foreground">
                  ₦{total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        ) : payments.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-10 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">No Payments Yet</h3>
              <p className="text-sm text-muted-foreground">
                Payments for services and dues will appear here once submitted.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-3 text-[10px] tracking-wider uppercase font-semibold text-muted-foreground">Type</th>
                      <th className="text-left px-5 py-3 text-[10px] tracking-wider uppercase font-semibold text-muted-foreground">Description</th>
                      <th className="text-left px-5 py-3 text-[10px] tracking-wider uppercase font-semibold text-muted-foreground">Amount</th>
                      <th className="text-left px-5 py-3 text-[10px] tracking-wider uppercase font-semibold text-muted-foreground hidden sm:table-cell">Receipt No</th>
                      <th className="text-left px-5 py-3 text-[10px] tracking-wider uppercase font-semibold text-muted-foreground">Status</th>
                      <th className="text-left px-5 py-3 text-[10px] tracking-wider uppercase font-semibold text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => {
                      const status = STATUS_LABELS[p.status];
                      return (
                        <tr key={`${p.type}-${p.id}`} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-4">
                            <Badge variant="outline" className={`text-[10px] ${p.type === "dues" ? "border-amber-300 text-amber-700 bg-amber-50" : "border-primary/30 text-primary bg-primary/5"}`}>
                              {p.type === "dues" ? "Dues" : "Service"}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 font-medium text-foreground">
                            {p.description}
                          </td>
                          <td className="px-5 py-4 font-semibold text-foreground">
                            {p.amount !== null
                              ? `₦${Number(p.amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                              : "-"}
                          </td>
                          <td className="px-5 py-4 text-xs text-muted-foreground hidden sm:table-cell font-mono">
                            {p.bin || "-"}
                          </td>
                          <td className="px-5 py-4">
                            <Badge variant="outline" className={`text-[10px] ${status?.className || ""}`}>
                              {status?.label || p.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AnaochaPayments;
