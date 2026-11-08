import type { Product } from '../shared/schema';

type Event = { type: string; productId: string | null; variantId: string | null; createdAt: string };
export default function StatsDetails({ events, products }: { events: Event[]; products: Product[] }) {
  const days = new Map<string, number>(); const variants = new Map<string, number>();
  for (const event of events) {
    const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Dushanbe' }).format(new Date(event.createdAt));
    days.set(day, (days.get(day) || 0) + 1);
    if (event.type === 'product' && event.productId && event.variantId) {
      const product = products.find((item) => item.id === event.productId);
      const variant = product?.variants.find((item) => item.id === event.variantId);
      const label = product && variant ? `${product.name} · ${variant.name}` : 'Удалённый товар или оттенок';
      variants.set(label, (variants.get(label) || 0) + 1);
    }
  }
  return <div className="stats-details"><div><h3>Открытия оттенков</h3>{Array.from(variants).sort((a, b) => b[1] - a[1]).map(([name, count]) => <p key={name}>{name}: {count}</p>)}{variants.size === 0 && <p>Пока нет открытий.</p>}</div><div><h3>События по дням</h3>{Array.from(days).map(([day, count]) => <p key={day}>{day}: {count}</p>)}{days.size === 0 && <p>Пока нет событий.</p>}</div></div>;
}
