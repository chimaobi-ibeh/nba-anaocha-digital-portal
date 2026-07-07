import { useState } from "react";
import { Check, Copy, Landmark } from "lucide-react";
import { BRANCH_BANK_ACCOUNT } from "@/lib/constants";

// Branch bank account panel shown wherever a member is asked to pay by
// transfer (dues, service applications) before uploading their receipt.
const BankTransferDetails = ({ amountNaira }: { amountNaira?: number }) => {
  const [copied, setCopied] = useState(false);

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(BRANCH_BANK_ACCOUNT.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (http / older browser): the number is visible anyway.
    }
  };

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Landmark className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold tracking-wider uppercase text-primary">
          Pay by Bank Transfer
        </p>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Bank</dt>
          <dd className="font-semibold text-foreground text-right">{BRANCH_BANK_ACCOUNT.bankName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Account Name</dt>
          <dd className="font-semibold text-foreground text-right">{BRANCH_BANK_ACCOUNT.accountName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Account Number</dt>
          <dd className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-foreground tracking-wide">{BRANCH_BANK_ACCOUNT.accountNumber}</span>
            <button
              type="button"
              onClick={copyAccountNumber}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Copy account number"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </dd>
        </div>
        {amountNaira !== undefined && amountNaira > 0 && (
          <div className="flex items-baseline justify-between gap-3 pt-1.5 border-t border-primary/10">
            <dt className="text-muted-foreground shrink-0">Amount</dt>
            <dd className="font-bold text-foreground">₦{amountNaira.toLocaleString("en-NG")}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        After transferring, upload your bank receipt below. The secretariat will
        review it and issue your official branch receipt number once confirmed.
      </p>
    </div>
  );
};

export default BankTransferDetails;
