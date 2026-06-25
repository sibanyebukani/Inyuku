import { copy } from '@/lib/whatsapp/copy';

export function NonAiNotice() {
  return (
    <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {copy.autoReplies.nonAi}
    </p>
  );
}
