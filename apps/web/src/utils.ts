export async function compressImage(file: File) {
  const imageBitmap = await createImageBitmap(file);
  const maxWidth = 1440;
  const scale = Math.min(1, maxWidth / imageBitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imageBitmap.width * scale);
  canvas.height = Math.round(imageBitmap.height * scale);
  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88)
  );

  if (!blob) {
    return file;
  }

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg"
  });
}

export function formatRemainingTime(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return "已过期";
  }

  const hours = Math.max(1, Math.round(diff / 1000 / 60 / 60));
  return `约 ${hours} 小时内可回看`;
}

