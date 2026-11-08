import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { productSchema, type Category, type Product, type ProductInput, type Variant } from '../shared/schema';
import { availability } from '../shared/availability';
import { api, money } from './api';

function emptyVariant(): Variant { return { id: crypto.randomUUID(), name: 'Основной', color: '#d5aaa6', sku: '', available: null, price: null, images: [] }; }
function stockValue(value: string) { return value === '' ? null : value === 'true'; }
function amount(value: string) { return value === '' ? null : Math.round(Number(value) * 100); }

export default function ProductEditor({ product, categories, onDone, onBusyChange }: {
  product: Product | null; categories: Category[]; onDone: (saved: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [form, setForm] = useState<ProductInput>(() => product ? productSchema.parse(product) : {
    name: '', description: '', usage: '', ingredients: '', volume: '', categoryId: categories.find((c) => c.name !== 'Демонстрация')?.id || categories[0]?.id || '',
    price: null, salePrice: null, available: null, visible: false, isNew: false, recommended: false, position: 0, variants: [emptyVariant()],
  });
  const [selectedId, setSelectedId] = useState(form.variants[0].id);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const uploadLock = useRef(false);
  const selected = form.variants.find((v) => v.id === selectedId) || form.variants[0];
  const photo = selected.images[photoIndex] || selected.images[0];
  const busy = saving || uploading;
  const price = selected.price ?? form.salePrice ?? form.price;
  const stock = availability(form, selected);

  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || uploadLock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(patch: Partial<ProductInput>) { setForm((previous) => ({ ...previous, ...patch })); setDirty(true); setError(''); setMessage(''); }
  function changeVariant(id: string, patch: Partial<Variant>) {
    setForm((previous) => ({ ...previous, variants: previous.variants.map((v) => v.id === id ? { ...v, ...patch } : v) }));
    setDirty(true); setError(''); setMessage('');
  }
  function selectVariant(id: string) { setSelectedId(id); setPhotoIndex(0); }
  function close() { if (!busy && (!dirty || window.confirm('Изменения ещё не сохранены. Вернуться к товарам без сохранения?'))) onDone(false); }
  function cover(index: number) {
    const images = [...selected.images]; const [image] = images.splice(index, 1); images.unshift(image);
    changeVariant(selected.id, { images }); setPhotoIndex(0);
  }
  function movePhoto(index: number, delta: number) {
    const other = index + delta; if (other < 0 || other >= selected.images.length) return;
    const images = [...selected.images]; [images[index], images[other]] = [images[other], images[index]];
    changeVariant(selected.id, { images }); setPhotoIndex(other);
  }
  function removePhoto(index: number) {
    if (!window.confirm('Убрать это фото из товара? Изменение вступит в силу после сохранения.')) return;
    changeVariant(selected.id, { images: selected.images.filter((_, i) => i !== index) }); setPhotoIndex(0);
  }
  async function upload(files: FileList | null, replaceIndex?: number) {
    if (!files?.length || uploadLock.current || saving) return;
    const list = Array.from(files); const id = selected.id;
    if ((replaceIndex === undefined ? selected.images.length + list.length : selected.images.length) > 10) { setError('У одного варианта может быть до 10 фото. Сначала уберите лишнее.'); return; }
    if (list.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024)) { setError('Выберите JPG, PNG или WebP до 4 МБ на каждое фото.'); return; }
    uploadLock.current = true; setUploading(true); setError(''); setMessage('Загружаем фото… Не закрывайте редактор.');
    const urls: string[] = [];
    try {
      for (const file of list) {
        const body = new FormData(); body.append('file', file);
        const result = await api<{ url: string }>('/api/admin/upload', { method: 'POST', body }); urls.push(result.url);
      }
      setMessage(replaceIndex === undefined ? 'Фото добавлены. Нажмите «Сохранить изменения».' : 'Фото заменено. Нажмите «Сохранить изменения».');
    } catch (cause) {
      setMessage(''); setError(`${cause instanceof Error ? cause.message : 'Не удалось загрузить фото.'}${urls.length ? ' Успешно загруженные фото добавлены — их можно сохранить.' : ' Прежние фото сохранены.'}`);
    } finally {
      if (urls.length) {
        // Apply by stable variant ID to the latest draft, never a stale pre-upload form.
        setForm((previous) => ({ ...previous, variants: previous.variants.map((v) => v.id !== id ? v : { ...v, images: replaceIndex === undefined ? [...v.images, ...urls] : v.images.map((image, i) => i === replaceIndex ? urls[0] : image) }) }));
        setDirty(true); setPhotoIndex(replaceIndex ?? selected.images.length);
      }
      uploadLock.current = false; setUploading(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || uploadLock.current) return;
    setError(''); setMessage('');
    if (!form.name.trim()) { setError('Напишите название товара.'); return; }
    if (!form.categoryId) { setError('Выберите категорию товара.'); return; }
    if (form.salePrice !== null && (form.price === null || form.salePrice >= form.price)) { setError('Для скидки укажите обычную цену. Цена со скидкой должна быть ниже неё.'); return; }
    const parsed = productSchema.safeParse({ ...form, name: form.name.trim(), variants: form.variants.map((v) => ({ ...v, name: v.name.trim() })) });
    if (!parsed.success) { setError('Проверьте название варианта, цены и количество фотографий. Пустую цену можно не заполнять.'); return; }
    setSaving(true);
    try { await api(product ? `/api/admin/products/${product.id}` : '/api/admin/products', { method: product ? 'PUT' : 'POST', body: JSON.stringify(parsed.data) }); setDirty(false); onDone(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить. Ваши изменения остались в редакторе.'); }
    finally { setSaving(false); }
  }

  return <div className="product-workspace">
    <div className="product-editor-heading"><button type="button" className="back-to-products" onClick={close} disabled={busy}><ArrowLeft size={18}/> К товарам</button><div><h2>{product ? 'Редактировать товар' : 'Добавить товар'}</h2><p>Поменяйте нужное и нажмите «Сохранить изменения».</p></div></div>
    <form className="product-edit-form" onSubmit={save}>
      <fieldset disabled={busy} className="product-edit-fields"><legend className="sr-only">Поля товара</legend>
        <div className="product-edit-layout"><div className="product-edit-sections">
          <section className="edit-section"><div className="edit-section-heading"><span>1</span><div><h3>Основное</h3><p>Название, цена и наличие — всё самое нужное.</p></div></div>
            <div className="edit-grid"><label className="edit-wide">Название товара <span className="field-required">*</span><input name="name" required maxLength={150} value={form.name} placeholder="Например: Air Freshener Jasmine" onChange={(e) => update({ name: e.target.value })}/></label>
              <label>Категория <span className="field-required">*</span><select required value={form.categoryId} onChange={(e) => update({ categoryId: e.target.value })}><option value="">Выберите категорию</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Объём / вес<input maxLength={100} value={form.volume} placeholder="Например: 300 мл" onChange={(e) => update({ volume: e.target.value })}/></label>
              <label>Цена, сомони<input type="number" min="0" step="0.01" value={form.price === null ? '' : form.price / 100} placeholder="Можно оставить пустой" onChange={(e) => update({ price: amount(e.target.value) })}/></label>
              <label>Наличие<select value={form.available === null ? '' : String(form.available)} onChange={(e) => update({ available: stockValue(e.target.value) })}><option value="">Пока не указано</option><option value="true">В наличии</option><option value="false">Нет в наличии</option></select></label>
              <label className="edit-wide">Описание<textarea rows={3} maxLength={5000} value={form.description} placeholder="Что это за средство и чем оно полезно покупателю" onChange={(e) => update({ description: e.target.value })}/></label>
            </div>
            <label className="publication-setting"><input type="checkbox" checked={form.visible} onChange={(e) => update({ visible: e.target.checked })}/><span><b>Показывать товар на сайте</b><small>{form.visible ? 'После сохранения покупатели увидят товар.' : 'Товар сохранится в админке и будет скрыт от покупателей.'}</small></span></label>
          </section>
          <section className="edit-section"><div className="edit-section-heading"><span>2</span><div><h3>Фото и варианты</h3><p>Нажмите на фото, чтобы рассмотреть его справа. Первое фото — обложка.</p></div></div>
            {form.variants.length > 1 && <div className="editor-variant-tabs" aria-label="Выбрать вариант для редактирования">{form.variants.map((v) => <button type="button" key={v.id} aria-pressed={v.id === selected.id} onClick={() => selectVariant(v.id)}>{v.images[0] && <img src={v.images[0]} alt=""/>}<span>{v.name || 'Без названия'}</span></button>)}</div>}
            <div className="editing-variant-title"><b>{form.variants.length > 1 ? selected.name || 'Вариант без названия' : 'Фотографии товара'}</b><span>{selected.images.length} / 10 фото</span></div>
            {!selected.images.length && <div className="editor-no-photo"><ImagePlus size={32}/><p>Добавьте фото товара — оно появится здесь и в предпросмотре.</p></div>}
            <div className="editor-photo-grid">{selected.images.map((image, index) => <div className={`editor-photo-tile ${photo === image ? 'active' : ''}`} key={`${selected.id}-${image}`}>
              <button type="button" className="editor-photo-view" onClick={() => setPhotoIndex(index)} aria-label={`Посмотреть фото ${index + 1}`}><img src={image} alt={`${selected.name}, фото ${index + 1}`}/>{index === 0 && <span>Обложка</span>}</button>
              <div className="editor-photo-tools"><label className="photo-file-button">Заменить<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Заменить фото ${index + 1}`} onChange={(e) => { void upload(e.target.files, index); e.target.value = ''; }}/></label><button type="button" className="photo-remove" onClick={() => removePhoto(index)} aria-label={`Убрать фото ${index + 1}`}><Trash2 size={16}/></button></div>
              <button type="button" className="photo-cover" disabled={index === 0} onClick={() => cover(index)}>{index === 0 ? <><Check size={14}/> Главное фото</> : 'На обложку'}</button>
              {selected.images.length > 1 && <div className="photo-move"><button type="button" disabled={index === 0} aria-label={`Переместить фото ${index + 1} назад`} onClick={() => movePhoto(index, -1)}><ArrowLeft size={15}/></button><button type="button" disabled={index === selected.images.length - 1} aria-label={`Переместить фото ${index + 1} вперёд`} onClick={() => movePhoto(index, 1)}><ArrowRight size={15}/></button></div>}
            </div>)}</div>
            <label className={`add-photo-button ${selected.images.length >= 10 ? 'disabled' : ''}`}><ImagePlus size={20}/><span>Добавить фото<small>JPG, PNG или WebP · до 4 МБ · можно несколько</small></span><input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={selected.images.length >= 10} aria-label="Добавить фотографии" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }}/></label>
            <details className="editor-extra" open={form.variants.length > 1 ? true : undefined}><summary>Настройки варианта{form.variants.length === 1 ? ' — если есть цвет или аромат' : ''}</summary><div className="edit-grid">
              <label>Название варианта<input required maxLength={100} value={selected.name} onChange={(e) => changeVariant(selected.id, { name: e.target.value })}/></label>
              <label>Наличие варианта<select value={selected.available === null ? '' : String(selected.available)} onChange={(e) => changeVariant(selected.id, { available: stockValue(e.target.value) })}><option value="">Как у товара</option><option value="true">В наличии</option><option value="false">Нет в наличии</option></select></label>
              <label>Своя цена, сомони<input type="number" min="0" step="0.01" value={selected.price === null ? '' : selected.price / 100} placeholder="Как у товара" onChange={(e) => changeVariant(selected.id, { price: amount(e.target.value) })}/></label>
              <label>Артикул<input maxLength={100} value={selected.sku} onChange={(e) => changeVariant(selected.id, { sku: e.target.value })}/></label>
              <label>Метка цвета<input type="color" value={selected.color} onChange={(e) => changeVariant(selected.id, { color: e.target.value })}/></label>
            </div><p className="field-help">Пустая цена варианта берётся из цены товара. «Нет в наличии» у товара скрывает наличие всех его вариантов.</p>
              {form.variants.length > 1 && <button type="button" className="danger-text" onClick={() => { if (window.confirm(`Убрать вариант «${selected.name}» и его фото из товара? Нажмите «Сохранить», чтобы применить.`)) { update({ variants: form.variants.filter((v) => v.id !== selected.id) }); selectVariant(form.variants.find((v) => v.id !== selected.id)!.id); } }}><Trash2 size={15}/> Удалить этот вариант</button>}
            </details>
            <button type="button" className="add-variant-button" disabled={form.variants.length >= 20} onClick={() => { const next = emptyVariant(); next.name = `Вариант ${form.variants.length + 1}`; update({ variants: [...form.variants, next] }); selectVariant(next.id); }}><Plus size={18}/> Добавить другой цвет / аромат</button>
          </section>
          <details className="edit-section editor-additional"><summary>Дополнительные настройки <span>скидка, применение, состав, отметки</span></summary><div className="edit-grid">
            <label>Цена со скидкой, сомони<input type="number" min="0" step="0.01" value={form.salePrice === null ? '' : form.salePrice / 100} placeholder="Необязательно" onChange={(e) => update({ salePrice: amount(e.target.value) })}/></label>
            <label>Порядок на сайте<input type="number" step="1" value={form.position} onChange={(e) => update({ position: Number(e.target.value) })}/></label>
            <label className="edit-wide">Применение<textarea maxLength={3000} value={form.usage} onChange={(e) => update({ usage: e.target.value })}/></label>
            <label className="edit-wide">Состав<textarea maxLength={5000} value={form.ingredients} onChange={(e) => update({ ingredients: e.target.value })}/></label>
          </div><div className="checks">{([['isNew', 'Новинка'], ['recommended', 'Рекомендуем']] as const).map(([key, text]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={(e) => update({ [key]: e.target.checked })}/>{text}</label>)}</div></details>
        </div>
        <aside className="editor-live-preview"><div className="preview-heading"><Eye size={17}/><b>Так увидит покупатель</b><span>Предпросмотр</span></div><div className="preview-image">{photo ? <img src={photo} alt={`Предпросмотр: ${form.name || 'товар'}`}/> : <span><ImagePlus size={36}/> Здесь будет фото</span>}</div>
          <div className="preview-copy"><small>{categories.find((c) => c.id === form.categoryId)?.name}</small><h3>{form.name || 'Название товара'}</h3>{form.variants.length > 1 && <p>{selected.name}</p>}<strong>{price === null ? 'Цена пока не указана' : money(price)}</strong><p className={stock === true ? 'stock' : ''}>{stock === null ? 'Наличие пока не указано' : stock ? '● В наличии' : 'Нет в наличии'}</p><p className="preview-description">{form.description || 'Здесь появится описание товара.'}</p>{photo && <a href={photo} target="_blank" rel="noreferrer">Открыть фото в полном размере ↗</a>}<p className="preview-publication">{form.visible ? 'Будет виден на сайте после сохранения' : 'Скрыт от покупателей'}</p></div>
        </aside></div>
      </fieldset>
      <div className="editor-save-bar"><div aria-live="polite">{error ? <p role="alert" className="error">{error}</p> : message ? <p role="status">{message}</p> : <span>{dirty ? 'Есть несохранённые изменения' : 'Можно изменить любое поле или фото'}</span>}</div><div><button type="button" className="admin-secondary" onClick={close} disabled={busy}>Отмена</button><button type="submit" className="button editor-save" disabled={busy}><Save size={18}/>{uploading ? 'Загружаем фото…' : saving ? 'Сохраняем…' : 'Сохранить изменения'}</button></div></div>
    </form>
  </div>;
}
