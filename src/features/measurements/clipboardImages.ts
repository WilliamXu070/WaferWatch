type ClipboardImageItem = {
  kind?: string;
  type: string;
  getAsFile: () => File | null;
};

type ClipboardImageSource = {
  items?: ArrayLike<ClipboardImageItem>;
  files?: ArrayLike<File>;
};

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function withClipboardFileName(file: File, index: number) {
  if (file.name.trim()) {
    return file;
  }

  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `clipboard-image-${index + 1}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified
  });
}

export function getClipboardImageFiles(source: ClipboardImageSource) {
  const itemFiles = Array.from(source.items ?? [])
    .filter((item) => item.kind === undefined || item.kind === "file")
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const directFiles = Array.from(source.files ?? []).filter(isImageFile);
  const seen = new Set<string>();

  return [...itemFiles, ...directFiles]
    .map(withClipboardFileName)
    .filter((file) => {
      const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}
