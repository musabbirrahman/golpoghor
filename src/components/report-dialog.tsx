import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import type { ReportTarget } from "../lib/types";
import { AppError } from "../lib/utils";
import { Button, FieldError, Input, Label, Modal, Select, Textarea } from "./ui";

const REASON_KEYS = [
  "reasonSpam",
  "reasonHarassment",
  "reasonHateSpeech",
  "reasonPlagiarism",
  "reasonSexualContent",
  "reasonViolence",
  "reasonOther",
] as const;

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  targetLabel: string;
}) {
  const { t, dp, session } = useApp();
  const [reasonKey, setReasonKey] = useState<string>("");
  const [customReason, setCustomReason] = useState("");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);

  // Reset the form each time the dialog is closed, so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setReasonKey("");
      setCustomReason("");
      setDetails("");
      setDone(false);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const reason =
    reasonKey === "reasonOther"
      ? customReason.trim()
      : reasonKey
        ? t("reports", reasonKey)
        : "";

  const mutation = useMutation({
    mutationFn: () => dp.createReport(targetType, targetId, reason, details),
    onSuccess: () => setDone(true),
  });

  const errMsg =
    mutation.error instanceof AppError ? t("errors", mutation.error.code) : mutation.error ? t("errors", "generic") : null;

  return (
    <Modal open={open} onClose={onClose} title={`${t("reports", "title")}: ${targetLabel}`}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">{t("reports", "submitted")}</p>
          <Button onClick={onClose}>{t("common", "close")}</Button>
        </div>
      ) : !session ? (
        <p className="text-sm text-ink-soft">{t("errors", "signInRequired")}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="report-reason">{t("reports", "reason")}</Label>
            <Select
              id="report-reason"
              value={reasonKey}
              onChange={(e) => setReasonKey(e.target.value)}
              required
            >
              <option value="">{t("reports", "reasons")}</option>
              {REASON_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t("reports", k)}
                </option>
              ))}
            </Select>
          </div>
          {reasonKey === "reasonOther" && (
            <div>
              <Label htmlFor="report-custom-reason">{t("reports", "customReason")}</Label>
              <Input
                id="report-custom-reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder={t("reports", "reasonPlaceholder")}
                maxLength={120}
              />
            </div>
          )}
          <div>
            <Label htmlFor="report-details">{t("reports", "details")}</Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <FieldError message={errMsg} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common", "cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={mutation.isPending || !reason.trim()}>
              {mutation.isPending ? t("common", "loading") : t("reports", "submit")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
