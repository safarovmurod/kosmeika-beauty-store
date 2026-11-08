import { useState } from 'react';
import { ImageOff, Pencil, Search, Trash2 } from 'lucide-react';
import type { Category, Product } from '../shared/schema';
import { availability } from '../shared/availability';
import { money } from './api';

export type ProductFilters = { query: string; category: string; status: string };

export default function AdminProducts({ products, categories, onEdit, onDelete, filters, onFiltersChange }: {
  products: Product[]; categories: Category[]; onEdit: (product: Product) => void;
  onDelete: (product: Product) => Promise<void>;
  filters: ProductFilters; onFiltersChange: (filters: ProductFilters) => void;
}) {
  const { query, category, status } = filters;
  const [deleting, setDeleting] = useState<string | null>(null);
  const search = query.trim().toLocaleLowerCase('ru');
  const filtered = products.filter((product) =>
    (!search || `${product.name} ${product.variants.map((v) => `${v.name} ${v.sku}`).join(' ')}`.toLocaleLowerCase('ru').includes(search)) &&
    (!category || product.categoryId === category) &&
    (status === 'all' || (status === 'visible' && product.visible) || (status === 'hidden' && !product.visible) ||
      (status === 'unfinished' && (product.price === null || product.available === null || product.variants.some((v) => !v.images.length)))));

  async function remove(product: Product) {
    if (deleting || !window.confirm(`Удалить «${product.name}»?\nТовар исчезнет с сайта. Это действие нельзя отменить.`)) return;
    setDeleting(product.id);
    try { await onDelete(product); } finally { setDeleting(null); }
  }

  return <section className="manage-products" aria-label="Управление товарами">
    <p className="manage-intro">Найдите товар по фото или названию и нажмите «Редактировать». Там можно поменять фотографии, цену и наличие.</p>
    <div className="manage-toolbar">
      <label className="manage-search"><Search size={18}/><input aria-label="Найти товар в админке" placeholder="Название, вариант или артикул" value={query} onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}/></label>
      <label>Категория<select value={category} onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}><option value="">Все категории</option>{categories.filter((c) => products.some((p) => p.categoryId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Показать<select value={status} onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}><option value="all">Все товары</option><option value="visible">На сайте</option><option value="hidden">Скрытые</option><option value="unfinished">Нужно заполнить</option></select></label>
    </div>
    <div className="manage-results"><span>Показано {filtered.length} из {products.length}</span>{(query || category || status !== 'all') && <button type="button" onClick={() => onFiltersChange({ query: '', category: '', status: 'all' })}>Сбросить поиск</button>}</div>
    {!filtered.length && <div className="manage-empty"><Search size={28}/><h2>{products.length ? 'Товар не найден' : 'Добавьте первый товар'}</h2><p>{products.length ? 'Попробуйте другое название или сбросьте фильтры.' : 'Нажмите «Добавить товар» вверху страницы.'}</p></div>}
    <div className="manage-grid">{filtered.map((product) => {
      const photos = product.variants.flatMap((v) => v.images);
      const first = product.variants[0];
      const stock = first ? availability(product, first) : null;
      const price = first?.price ?? product.salePrice ?? product.price;
      return <article className="manage-card" key={product.id}>
        <button type="button" className="manage-photo" onClick={() => onEdit(product)} aria-label={`Открыть редактор: ${product.name}`}>
          {photos[0] ? <img src={photos[0].replace(/\.webp$/, '-thumb.webp')} alt={product.name} loading="lazy" onError={(e) => { if (e.currentTarget.getAttribute('src') !== photos[0]) e.currentTarget.src = photos[0]; }}/> : <span><ImageOff size={32}/> Добавить фото</span>}
          <span className={`publication ${product.visible ? 'published' : ''}`}>{product.visible ? 'На сайте' : 'Скрыт'}</span>
          {photos.length > 1 && <span className="photo-total">{photos.length} фото · {product.variants.length} вар.</span>}
        </button>
        <div className="manage-card-copy"><small>{product.category.name}</small><button type="button" className="manage-name" onClick={() => onEdit(product)}>{product.name}</button>
          <div className="manage-card-values"><span>{price === null ? 'Цена не указана' : money(price)}</span><span className={stock === true ? 'stock' : ''}>{stock === null ? 'Наличие не указано' : stock ? 'В наличии' : 'Нет в наличии'}</span></div>
          <div className="manage-card-actions"><button type="button" className="button primary" onClick={() => onEdit(product)}><Pencil size={16}/> Редактировать</button><button type="button" className="manage-delete" onClick={() => void remove(product)} disabled={deleting !== null} aria-label={`Удалить товар: ${product.name}`} title="Удалить товар"><Trash2 size={18}/></button></div>
        </div>
      </article>;
    })}</div>
  </section>;
}
