'use client';

/**
 * The photo editor in the media library.
 *
 * Crop by aspect ratio rather than by dragging a rectangle. For email that is
 * the decision people actually make — "square for the product grid", "16:9 for
 * the hero" — and a ratio is exact, keyboard-reachable and works on a phone,
 * where dragging a handle over a 120 px thumbnail is guesswork. The numbers the
 * ratio produces are shown and can be typed over, so precision is still there
 * for anyone who wants it.
 *
 * Nothing here decides anything: the resulting size is computed for the preview
 * only, and the server recomputes it from the same inputs. The server is also
 * where every limit lives.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Crop, RotateCw } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { centredCrop, type CropRect } from '@/lib/crop';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const RATIOS = [
  { label: 'Original', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
] as const;

interface Props {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
}

export function EditImageButton({ id, filename, width, height }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [ratio, setRatio] = useState<number | null>(null);
  const [targetWidth, setTargetWidth] = useState('');
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [format, setFormat] = useState<'' | 'jpeg' | 'png' | 'webp'>('');
  const [quality, setQuality] = useState(82);

  const known = Boolean(width && height);

  const crop = useMemo<CropRect | null>(() => {
    if (!known || ratio === null) return null;
    return centredCrop(width!, height!, ratio);
  }, [known, ratio, width, height]);

  /** What the result will measure, for the line under the controls. */
  const preview = useMemo(() => {
    if (!known) return null;
    const base = crop ?? { width: width!, height: height! };
    const w = Number(targetWidth);
    const scaled =
      targetWidth && Number.isFinite(w) && w > 0
        ? { width: w, height: Math.max(1, Math.round((base.height * w) / base.width)) }
        : { width: base.width, height: base.height };
    return rotate === 90 || rotate === 270
      ? { width: scaled.height, height: scaled.width }
      : scaled;
  }, [known, crop, targetWidth, rotate, width, height]);

  const changed =
    crop !== null || targetWidth.trim() !== '' || rotate !== 0 || format !== '' || quality !== 82;

  async function save() {
    setBusy(true);
    try {
      const w = Number(targetWidth);
      const res = await fetch(`${API_BASE}/api/v1/media/${id}/transform`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(crop ? { crop } : {}),
          ...(targetWidth && Number.isFinite(w) && w > 0 ? { resize: { width: w } } : {}),
          ...(rotate ? { rotate } : {}),
          ...(format ? { format } : {}),
          ...(quality !== 82 ? { quality } : {}),
        }),
      });

      if (!res.ok) {
        // The server's message is the useful one — it knows the real limits.
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        toast('error', body?.message ?? `Failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: { filename: string } };
      toast('success', `Saved as "${body.data.filename}" — the original is untouched`);
      setOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900"
      >
        <Crop className="h-3.5 w-3.5" />
        Edit
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Edit ${filename}`} size="md">
        {!known ? (
          <p className="text-sm text-secondary-600">
            This asset has no stored dimensions, so a crop cannot be offered for it. Resize,
            rotation and format still work.
          </p>
        ) : (
          <p className="text-sm text-secondary-500">
            Source {width}×{height}. Editing saves a new asset — the original stays as it is,
            because campaigns already sent point at it.
          </p>
        )}

        <div className="mt-4 space-y-4">
          {known ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-secondary-700">Crop</p>
              <div className="flex flex-wrap gap-1.5">
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => setRatio(r.value)}
                    className={
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                      (ratio === r.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-secondary-600 ring-1 ring-secondary-200 hover:bg-secondary-50')
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {crop ? (
                <p className="mt-1.5 text-[11px] text-secondary-500">
                  Taking {crop.width}×{crop.height} from {crop.left},{crop.top} — centred.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="target-width"
              className="mb-1.5 block text-xs font-medium text-secondary-700"
            >
              Width in pixels (height follows)
            </label>
            <input
              id="target-width"
              type="number"
              min={1}
              max={10000}
              value={targetWidth}
              onChange={(e) => setTargetWidth(e.target.value)}
              placeholder={known ? String(crop?.width ?? width) : 'e.g. 600'}
              className="h-9 w-40 rounded-md border border-secondary-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-[11px] text-secondary-500">
              600 px is the usual content width of an email.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-secondary-700">Rotate</p>
            <div className="flex gap-1.5">
              {([0, 90, 180, 270] as const).map((deg) => (
                <button
                  key={deg}
                  onClick={() => setRotate(deg)}
                  className={
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                    (rotate === deg
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-secondary-600 ring-1 ring-secondary-200 hover:bg-secondary-50')
                  }
                >
                  {deg === 0 ? 'None' : <RotateCw className="h-3 w-3" />}
                  {deg === 0 ? '' : `${deg}°`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="out-format"
                className="mb-1.5 block text-xs font-medium text-secondary-700"
              >
                Format
              </label>
              <select
                id="out-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
                className="h-9 rounded-md border border-secondary-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Keep</option>
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>
            <div className="flex-1">
              <label
                htmlFor="quality"
                className="mb-1.5 block text-xs font-medium text-secondary-700"
              >
                Quality {quality}
              </label>
              <input
                id="quality"
                type="range"
                min={30}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-[11px] text-secondary-500">
                Applies to JPEG and WebP. PNG is lossless and ignores it.
              </p>
            </div>
          </div>

          {preview ? (
            <p className="rounded-md bg-secondary-50 px-3 py-2 text-xs text-secondary-700">
              Result: <strong>{preview.width}</strong>×<strong>{preview.height}</strong> px
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2 text-sm font-medium text-secondary-600 hover:bg-secondary-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || pending || !changed}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            title={changed ? undefined : 'Change something first'}
          >
            {busy ? 'Working…' : 'Save as new asset'}
          </button>
        </div>
      </Modal>
    </>
  );
}
