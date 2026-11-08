export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options?.headers } });
  if (!response.ok) {
    const data: { error?: string } = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось выполнить запрос');
  }
  return response.json() as Promise<T>;
}
export function track(type: 'view' | 'product' | 'whatsapp', productId?: string, variantId?: string) {
  const body = JSON.stringify({ id: crypto.randomUUID(), type, productId, variantId });
  if (!navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))) void fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
}
export function money(value: number) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value / 100)} сомони`; }
