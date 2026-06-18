"use client";

import {
  type ClipboardEvent,
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useDropzone } from "react-dropzone";
import {
  createDieInspection,
  getDieInspectionPreviewUrl,
  listDieInspections,
  type DieInspectionRecord
} from "@/features/inspections/actions";
import { getTextSurface, upsertTextSurface } from "@/features/text-surfaces/actions";
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
  preloadedInspections?: DieInspectionRecord[];
  onInspectionsChange?: (inspections: DieInspectionRecord[]) => void;
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
  hue,
  preloadedInspections,
  onInspectionsChange
}: DieInspectionMapProps) {
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [inspections, setInspections] = useState<DieInspectionRecord[]>([]);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [inspectionComment, setInspectionComment] = useState("");
  const [savedInspectionComment, setSavedInspectionComment] = useState("");
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const textSurfaceIdentity = useMemo(
    () => ({
      projectId,
      scopeType: "die_inspection_cell",
      scopeKey: `${waferId}:${dieCode}:R${row}:C${column}`,
      fieldKey: "comments"
    }),
    [column, dieCode, projectId, row, waferId]
  );
  const visibleInspections = useMemo(
    () =>
      [...(preloadedInspections ?? inspections)].sort((first, second) => {
        const xDifference = first.xRatio - second.xRatio;

        if (Math.abs(xDifference) > 0.0001) {
          return xDifference;
        }

        return first.yRatio - second.yRatio;
      }),
    [inspections, preloadedInspections]
  );
  const activeInspectionId = selectedInspectionId ?? visibleInspections[0]?.id ?? null;
  const selectedInspection = useMemo(
    () => visibleInspections.find((inspection) => inspection.id === activeInspectionId) ?? null,
    [activeInspectionId, visibleInspections]
  );
  const selectedInspectionIndex = useMemo(
    () =>
      selectedInspection
        ? visibleInspections.findIndex((inspection) => inspection.id === selectedInspection.id)
        : -1,
    [selectedInspection, visibleInspections]
  );

  const selectInspectionByOffset = useCallback(
    (offset: number) => {
      if (visibleInspections.length === 0) {
        return;
      }

      const currentIndex = selectedInspectionIndex >= 0 ? selectedInspectionIndex : 0;
      const nextIndex = (currentIndex + offset + visibleInspections.length) % visibleInspections.length;
      const nextInspection = visibleInspections[nextIndex];

      setSelectedInspectionId(nextInspection.id);
      setPendingPin(null);
      setIsPreviewLoading(!nextInspection.imageUrl);
      setUploadError(null);
    },
    [selectedInspectionIndex, visibleInspections]
  );

  useEffect(() => {
    if (preloadedInspections) {
      return;
    }

    let isStale = false;

    void listDieInspections({ waferId, dieCode, row, column }).then((result) => {
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
  }, [column, dieCode, preloadedInspections, row, waferId]);

  useEffect(() => {
    let isStale = false;

    void getTextSurface(textSurfaceIdentity).then((result) => {
      if (isStale) {
        return;
      }

      if (result.ok) {
        const value = result.data?.value ?? "";
        setInspectionComment(value);
        setSavedInspectionComment(value);
      } else {
        setUploadError(result.error);
      }
    });

    return () => {
      isStale = true;
    };
  }, [textSurfaceIdentity]);

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
      if (target?.closest(".die-inspection-card")) {
        return;
      }

      setPendingPin(null);
      setSelectedInspectionId(null);
      setUploadError(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [pendingPin, selectedInspection]);

  useEffect(() => {
    if (visibleInspections.length < 2 || pendingPin) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectInspectionByOffset(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectInspectionByOffset(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingPin, selectInspectionByOffset, visibleInspections.length]);

  useEffect(() => {
    if (!selectedInspection || selectedInspection.imageUrl) {
      return;
    }

    let isStale = false;

    void getDieInspectionPreviewUrl({ inspectionId: selectedInspection.id }).then((result) => {
      if (isStale) {
        return;
      }

      if (result.ok) {
        const updatePreviewUrl = (current: DieInspectionRecord[]) =>
          current.map((inspection) =>
            inspection.id === selectedInspection.id
              ? { ...inspection, imageUrl: result.data.imageUrl }
              : inspection
          );

        if (preloadedInspections) {
          onInspectionsChange?.(updatePreviewUrl(preloadedInspections));
        } else {
          setInspections(updatePreviewUrl);
        }
      } else {
        setUploadError(result.error);
      }

      setIsPreviewLoading(false);
    });

    return () => {
      isStale = true;
    };
  }, [onInspectionsChange, preloadedInspections, selectedInspection]);

  const saveInspectionComment = useCallback(
    async (value: string) => {
      if (value === savedInspectionComment) {
        return;
      }

      const result = await upsertTextSurface({
        ...textSurfaceIdentity,
        value
      });

      if (result.ok) {
        setSavedInspectionComment(result.data.value);
      } else {
        setUploadError(result.error);
      }
    },
    [savedInspectionComment, textSurfaceIdentity]
  );

  useEffect(() => {
    if (inspectionComment === savedInspectionComment) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveInspectionComment(inspectionComment);
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [inspectionComment, savedInspectionComment, saveInspectionComment]);

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
        row,
        column,
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

      if (preloadedInspections) {
        onInspectionsChange?.([...preloadedInspections, result.data]);
      } else {
        setInspections((current) => [...current, result.data]);
      }
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
    setIsPreviewLoading(false);
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

  const bubblePin = pendingPin;

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
        {visibleInspections.map((inspection) => (
          <button
            type="button"
            className={[
              "die-inspection-pin",
              activeInspectionId === inspection.id ? "die-inspection-pin--selected" : ""
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
              setIsPreviewLoading(!inspection.imageUrl);
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
            ) : null}
          </div>
        ) : null}
      </div>
      {visibleInspections.length > 0 ? (
        <div className="die-inspection-media-viewer" aria-label="Inspection media viewer">
          <div className="die-inspection-media-viewer__chrome">
            <button
              type="button"
              className="button button-secondary die-inspection-media-viewer__arrow"
              onClick={() => selectInspectionByOffset(-1)}
              disabled={visibleInspections.length < 2}
              aria-label="Previous inspection image"
            >
              {"<"}
            </button>
            <div className="die-inspection-media-viewer__count">
              {Math.max(selectedInspectionIndex + 1, 1)} / {visibleInspections.length}
            </div>
            <button
              type="button"
              className="button button-secondary die-inspection-media-viewer__arrow"
              onClick={() => selectInspectionByOffset(1)}
              disabled={visibleInspections.length < 2}
              aria-label="Next inspection image"
            >
              {">"}
            </button>
          </div>
          <div className="die-inspection-media-viewer__stage">
            {isPreviewLoading ? (
              <p>Loading preview...</p>
            ) : selectedInspection?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedInspection.imageUrl} alt={selectedInspection.imageFileName} />
            ) : (
              <p>No preview image is available for this pin.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="die-inspection-media-viewer die-inspection-media-viewer--empty">
          <p>No inspection images have been attached to this region yet.</p>
        </div>
      )}
      <label className="die-inspection-comments">
        <span>Comments</span>
        <textarea
          aria-label={`Comments for row ${row}, column ${column}`}
          rows={3}
          value={inspectionComment}
          onChange={(event) => setInspectionComment(event.target.value)}
          onBlur={(event) => void saveInspectionComment(event.target.value)}
        />
      </label>
    </section>
  );
}
