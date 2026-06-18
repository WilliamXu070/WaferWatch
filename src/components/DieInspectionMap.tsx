"use client";

import { type ClipboardEvent, type CSSProperties, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  createDieInspection,
  deleteDieInspection,
  listDieInspections,
  type DieInspectionRecord
} from "@/features/inspections/actions";
import { createClient } from "@/lib/supabase/client";

type PendingPin = {
  xRatio: number;
  yRatio: number;
};

type DieInspectionMapProps = {
  projectId: string;
  waferId: string;
  dieCode: string;
  dieName: string;
  row: number;
  column: number;
  hue: number;
};

const INSPECTION_BUCKET = "wafer-process-files";

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getFileExtension(file: File) {
  if (file.type === "image/jpeg") {
    return "jpg";
  }

  return "png";
}

function normalizeImageFile(file: File) {
  if (file.type === "image/png" || file.type === "image/jpeg") {
    return file;
  }

  throw new Error("Use a PNG or JPEG image for inspection uploads.");
}

export function DieInspectionMap({
  projectId,
  waferId,
  dieCode,
  dieName,
  row,
  column,
  hue
}: DieInspectionMapProps) {
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [inspections, setInspections] = useState<DieInspectionRecord[]>([]);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === selectedInspectionId) ?? null,
    [inspections, selectedInspectionId]
  );

  useEffect(() => {
    let isStale = false;

    void listDieInspections({ waferId, dieCode }).then((result) => {
      if (isStale) {
        return;
      }

      if (result.ok) {
        setInspections(result.data);
      } else {
        setUploadError(result.error);
      }
    });

    return () => {
      isStale = true;
    };
  }, [dieCode, waferId]);

  useEffect(() => {
    if (!pendingPin) {
      return;
    }

    const timeout = window.setTimeout(() => {
      bubbleRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [pendingPin]);

  useEffect(() => {
    if (!pendingPin && !selectedInspection) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (bubbleRef.current?.contains(event.target as Node)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest(".die-inspection-map")) {
        return;
      }

      setPendingPin(null);
      setSelectedInspectionId(null);
      setUploadError(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [pendingPin, selectedInspection]);

  const uploadInspectionFile = async (rawFile: File, pin: PendingPin) => {
    try {
      const file = normalizeImageFile(rawFile);
      const inspectionId = crypto.randomUUID();
      const extension = getFileExtension(file);
      const imagePath = `${projectId}/wafers/${waferId}/dies/${dieCode}/inspections/${inspectionId}.${extension}`;
      setIsUploading(true);
      setUploadError(null);

      const signedResponse = await fetch("/api/storage/signed-upload", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectId,
          bucketName: INSPECTION_BUCKET,
          objectPath: imagePath
        })
      });

      if (!signedResponse.ok) {
        const payload = await signedResponse.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to create inspection upload.");
      }

      const signedUpload = await signedResponse.json();
      const supabase = createClient();
      const { error: uploadErrorResult } = await supabase.storage
        .from(INSPECTION_BUCKET)
        .uploadToSignedUrl(signedUpload.path, signedUpload.token, file, {
          contentType: file.type
        });

      if (uploadErrorResult) {
        throw new Error(uploadErrorResult.message);
      }

      const result = await createDieInspection({
        id: inspectionId,
        projectId,
        waferId,
        dieCode,
        xRatio: pin.xRatio,
        yRatio: pin.yRatio,
        imageBucket: INSPECTION_BUCKET,
        imagePath,
        imageMimeType: file.type,
        imageSizeBytes: file.size,
        imageFileName: file.name || `inspection-${inspectionId}.${extension}`
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      setInspections((current) => [...current, result.data]);
      setSelectedInspectionId(result.data.id);
      setPendingPin(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Inspection upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"]
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: !pendingPin || isUploading,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file || !pendingPin) {
        return;
      }

      void uploadInspectionFile(file, pendingPin);
    }
  });

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPendingPin({
      xRatio: clampRatio((event.clientX - rect.left) / rect.width),
      yRatio: clampRatio((event.clientY - rect.top) / rect.height)
    });
    setSelectedInspectionId(null);
    setUploadError(null);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );
    const file = imageItem?.getAsFile();

    if (!file || !pendingPin) {
      setUploadError("Clipboard does not contain a PNG or JPEG image.");
      return;
    }

    event.preventDefault();
    void uploadInspectionFile(file, pendingPin);
  };

  const handleDeleteInspection = async (inspectionId: string) => {
    const result = await deleteDieInspection({ inspectionId });

    if (result.ok) {
      setInspections((current) => current.filter((inspection) => inspection.id !== inspectionId));
      setSelectedInspectionId(null);
    } else {
      setUploadError(result.error);
    }
  };

  const bubblePin = pendingPin ?? selectedInspection;

  return (
    <section
      className="die-inspection-card"
      style={{ "--inspection-hue": `${hue}` } as CSSProperties}
    >
      <div className="die-inspection-header">
        <p className="eyebrow">Inspection</p>
        <h3>{dieName}</h3>
        <p>Row {row} / Column {column}</p>
      </div>

      <div className="die-inspection-map" onClick={handleMapClick} role="presentation">
        <div className="die-inspection-map__surface" />
        {inspections.map((inspection) => (
          <button
            type="button"
            className={[
              "die-inspection-pin",
              selectedInspectionId === inspection.id ? "die-inspection-pin--selected" : ""
            ].join(" ")}
            key={inspection.id}
            style={{
              left: `${inspection.xRatio * 100}%`,
              top: `${inspection.yRatio * 100}%`
            }}
            aria-label={`Open inspection ${inspection.imageFileName}`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedInspectionId(inspection.id);
              setPendingPin(null);
              setUploadError(null);
            }}
          />
        ))}
        {pendingPin ? (
          <span
            className="die-inspection-pin die-inspection-pin--pending"
            style={{
              left: `${pendingPin.xRatio * 100}%`,
              top: `${pendingPin.yRatio * 100}%`
            }}
          />
        ) : null}
        {bubblePin ? (
          <div
            ref={bubbleRef}
            className={[
              "die-inspection-bubble",
              pendingPin ? "die-inspection-bubble--pending" : "die-inspection-bubble--preview"
            ].join(" ")}
            style={{
              left: `${Number(bubblePin.xRatio) * 100}%`,
              top: `${Number(bubblePin.yRatio) * 100}%`
            }}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onPaste={pendingPin ? handlePaste : undefined}
          >
            {pendingPin ? (
              <>
                <div
                  {...getRootProps({
                    className: "die-inspection-drop-target",
                    onClick: (event) => event.stopPropagation()
                  })}
                >
                  <input {...getInputProps()} />
                  <strong>{isDragActive ? "Drop image here" : "Attach inspection image"}</strong>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      open();
                    }}
                    disabled={isUploading}
                  >
                    {isUploading ? "Uploading..." : "Upload from device"}
                  </button>
                  <p>Paste image here with Cmd+V.</p>
                </div>
                {uploadError ? <p className="die-inspection-error">{uploadError}</p> : null}
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setPendingPin(null);
                    setUploadError(null);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : selectedInspection ? (
              <>
                <strong>{selectedInspection.imageFileName}</strong>
                {selectedInspection.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedInspection.imageUrl} alt={selectedInspection.imageFileName} />
                ) : (
                  <p>Preview unavailable.</p>
                )}
                {uploadError ? <p className="die-inspection-error">{uploadError}</p> : null}
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => void handleDeleteInspection(selectedInspection.id)}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
