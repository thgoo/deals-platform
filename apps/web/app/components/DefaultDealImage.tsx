import { ImageOff } from 'lucide-react';

export default function DefaultDealImage() {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-linear-to-br from-[#E3F2FD] to-[#F5F5F5] opacity-50">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-lg border-3 border-[#D0D0D0] bg-[#F0F0F0] p-4 shadow-[3px_3px_0px_var(--pixel-dark)]">
          <ImageOff className="h-12 w-12 text-[#A0A0A0]" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
