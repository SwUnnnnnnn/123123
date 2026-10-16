export async function createProfileImageDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Не удалось обработать фотографию.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.68, 0.54, 0.4]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Не удалось обработать фотографию.');
    if (blob.size > 500_000) continue;

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result), { once: true });
      reader.addEventListener('error', () => reject(reader.error), { once: true });
      reader.readAsDataURL(blob);
    });
  }

  throw new Error('Фотография слишком большая после сжатия. Выбери другое изображение.');
}
