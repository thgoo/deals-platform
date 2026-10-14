self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Bargah', {
      body: data.body ?? '',
      icon: '/images/barga-dark.svg',
      badge: '/images/barga-dark.svg',
      data: { url: data.url ?? '/' },
      tag: data.tag,
      renotify: data.renotify ?? true,
      actions: data.actions ?? [{ action: 'view', title: 'Ver promoção' }],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url =
    event.action === 'dismiss' ? null : (event.notification.data?.url ?? '/');

  if (!url) return;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url === url && 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      }),
  );
});
