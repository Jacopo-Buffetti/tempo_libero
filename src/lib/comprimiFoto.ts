import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PhotoAsset = { uri: string; width: number; height: number };

export type CompressStep = { edge: number; quality: number };

export const bytesOf = (base64: string) =>
  Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

async function render(asset: PhotoAsset, edge: number, quality: number) {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > edge) {
    context.resize(asset.height >= asset.width ? { height: edge } : { width: edge });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
  return saved.base64!;
}

export async function compressPhoto(asset: PhotoAsset, steps: CompressStep[], targetBytes: number) {
  let best: string | null = null;
  for (const step of steps) {
    const base64 = await render(asset, step.edge, step.quality);
    if (!best || bytesOf(base64) < bytesOf(best)) best = base64;
    if (bytesOf(base64) <= targetBytes) break;
  }
  return { base64: best!, bytes: bytesOf(best!) };
}

export const formatSize = (bytes: number | null) =>
  bytes == null
    ? ''
    : bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
