import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import type { ReportTarget } from "../lib/types";
import { AppError } from "../lib/utils";
import { Button, FieldError, Input, Label, Modal, Textarea } from "./ui";

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
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);

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
            <Input
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reports", "reasonPlaceholder")}
              required
              maxLength={120}
            />
          </div>
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
