import { windowBannerCopy } from '@/lib/whatsapp/copy';

export function WindowBanner({
  windowState,
  windowExpiresAt,
}: {
  windowState: 'OPEN' | 'CLOSED';
  windowExpiresAt: string | null;
}) {
  const open = windowState === 'OPEN';
  return (
    <div
      role="status"
      className={`rounded px-3 py-2 text-sm ${
        open ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-700'
      }`}
    >
      {windowBannerCopy(windowState, windowExpiresAt)}
    </div>
  );
}
