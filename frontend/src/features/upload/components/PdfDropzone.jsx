import { useMemo, useRef, useState } from "react";
import { Button } from "../../../shared/ui/Button";
import { useTranslation } from "react-i18next";

/**
 * PDF drag-and-drop uploader with strict file type filtering.
 * @param {{
 *  onFilesAdded: (files: FileList | File[]) => void;
 *  disabled?: boolean;
 *  title?: string;
 *  description?: string;
 *  buttonText?: string;
 *  allowMultiple?: boolean;
 *  testId?: string;
 * }} props
 */
export function PdfDropzone({
  onFilesAdded,
  disabled = false,
  title,
  description,
  buttonText,
  allowMultiple = true,
  testId,
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const resolvedTitle = title || t("upload.dropzoneDefaultTitle");
  const resolvedDescription = description || t("upload.dropzoneDefaultDesc");
  const resolvedButtonText = buttonText || t("upload.dropzoneChoose");

  const className = useMemo(
    () => `dropzone p-4 ${isDragging ? "dropzone-active" : ""} ${disabled ? "opacity-60" : ""}`,
    [disabled, isDragging],
  );

  return (
    <section className={className} data-testid={testId}>
      <div
        role="button"
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled) {
            return;
          }
          onFilesAdded(event.dataTransfer.files);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-transparent p-4 text-center"
      >
        <div className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-blue-100 text-lg text-blue-700">↑</div>
        <p className="text-sm font-semibold text-ledger-ink">{resolvedTitle}</p>
        <p className="max-w-md text-xs text-ledger-smoke">{resolvedDescription}</p>
        <Button type="button" variant="primary" onClick={() => inputRef.current?.click()} disabled={disabled}>
          {resolvedButtonText}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={allowMultiple}
        hidden
        onChange={(event) => {
          if (event.target.files) {
            onFilesAdded(event.target.files);
            event.target.value = "";
          }
        }}
        disabled={disabled}
      />
    </section>
  );
}
