'use client';

function isIOS(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)
  );
}

function isStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export default function IOSInstallBanner() {
  if (!isIOS() || isStandalone()) return null;

  return (
    <div className="text-foreground rounded-lg border-(length:--border-width) border-(--color-border) bg-(--pixel-blue)/15 p-3 text-xs">
      <p className="font-bold">Para receber alertas no iPhone:</p>
      <p className="mt-1 text-(--color-text-muted)">
        Toque em <strong>Compartilhar</strong> →{' '}
        <strong>Adicionar à Tela de Início</strong> e reabra o app.
      </p>
    </div>
  );
}
