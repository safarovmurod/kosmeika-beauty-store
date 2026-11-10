import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Menu, MessageCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Category, Product, Variant } from '../shared/schema';
import { availability } from '../shared/availability';
import { api, money, track } from './api';
import { phone, productLink } from './whatsapp';
import WhatsAppComposer from './whatsapp-composer';

type Catalog = { products: Product[]; categories: Category[]; brand: string };
type OpenProduct = (product: Product, variant: Variant, photo?: string, ordering?: boolean) => void;

function Swatches({ product, selected, onChange }: { product: Product; selected: Variant; onChange: (variant: Variant) => void }) {
  if (product.variants.length < 2) return null;
  return <div className="swatches" aria-label="Варианты">{product.variants.map((variant) =>
    <button key={variant.id} type="button" aria-label={`Вариант ${variant.name}`} aria-pressed={selected.id === variant.id} className={`variant-choice ${selected.id === variant.id ? 'selected' : ''}`} onClick={() => onChange(variant)}>
      <span style={{ background: variant.color }} />{variant.name}
    </button>)}</div>;
}

function GalleryControls({ index, total, onMove }: { index: number; total: number; onMove: (delta: number) => void }) {
  if (total < 2) return null;
  return <div className="gallery-controls"><button type="button" className="icon-button" onClick={() => onMove(-1)} aria-label="Предыдущее фото / вариант"><ArrowLeft size={18}/></button><span aria-live="polite">{index + 1} / {total}</span><button type="button" className="icon-button" onClick={() => onMove(1)} aria-label="Следующее фото / вариант"><ArrowRight size={18}/></button></div>;
}

function ProductCard({ product, onOpen }: { product: Product; onOpen: OpenProduct }) {
  const [index, setIndex] = useState(0);
  const touch = useRef({ x: 0, y: 0, swiped: false });
  const reduceMotion = useReducedMotion();
  const gallery = product.variants.flatMap((variant): { variant: Variant; photo: string | undefined }[] => variant.images.length ? variant.images.map((photo) => ({ variant, photo })) : [{ variant, photo: undefined }]);
  const entry = gallery[index] || gallery[0];
  if (!entry) return null;
  const { variant: selected, photo } = entry;
  const available = availability(product, selected);
  const price = selected.price ?? product.salePrice ?? product.price;
  return <motion.article className="product-card" data-product-id={product.id} tabIndex={-1}
    initial={reduceMotion ? false : { opacity: 0, y: 28, rotateX: 9, scale: .97 }}
    whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }} viewport={{ once: true, amount: .08 }}
    whileHover={reduceMotion ? undefined : { y: -5, rotateY: 1.2 }} whileTap={reduceMotion ? undefined : { scale: .985 }}
    transition={{ type: 'spring', stiffness: 135, damping: 23 }} style={{ transformPerspective: 900 }}>
    <div className="card-gallery" onTouchStart={(event) => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY, swiped: false }; }} onTouchEnd={(event) => {
      const point = event.changedTouches[0];
      const delta = point.clientX - touch.current.x;
      if (gallery.length > 1 && Math.abs(delta) > 45 && Math.abs(delta) > Math.abs(point.clientY - touch.current.y)) {
        touch.current.swiped = true;
        if (event.cancelable) event.preventDefault();
        setIndex((current) => (current + (delta < 0 ? 1 : -1) + gallery.length) % gallery.length);
      }
    }}>
      <button className="product-image" onClick={() => { if (touch.current.swiped) { touch.current.swiped = false; return; } onOpen(product, selected, photo); }} aria-label={`Подробнее: ${product.name}`}>
        {photo ? <img key={photo} src={photo} srcSet={photo.endsWith('.webp') ? `${photo.replace(/\.webp$/, '-thumb.webp')} 480w, ${photo} 1000w` : undefined} sizes="(max-width: 600px) 50vw, (max-width: 900px) 33vw, 25vw" width="1000" height="1200" alt={`${product.name}, ${selected.name}`} loading="lazy"/> : <span className="missing-image">Фото уточняется</span>}
        <span className="badges">{product.isNew && <span>Новинка</span>}{product.recommended && <span>Выбор</span>}{product.salePrice !== null && <span>Акция</span>}</span><span className="image-arrow"><ArrowUpRight size={18}/></span>
      </button>
      <GalleryControls index={index} total={gallery.length} onMove={(delta) => setIndex((index + delta + gallery.length) % gallery.length)}/>
    </div>
    <div className="card-meta"><span>{product.category.name}</span><span className={available === true ? 'stock' : 'out'}>{available === null ? '' : available ? 'В наличии' : 'Нет в наличии'}</span></div>
    <button className="product-name" onClick={() => onOpen(product, selected, photo)}>{product.name}</button>
    <p className="card-description">{product.description}</p>
    <div className="card-variant">{product.variants.length > 1 && <span>{selected.name} · {product.variants.length} варианта</span>}</div>
    <div className="card-bottom"><div><strong>{price === null ? '' : money(price)}</strong>{selected.price === null && product.salePrice !== null && product.price !== null && <del>{money(product.price)}</del>}</div></div>
    <div className="card-contact"><button type="button" className="button card-whatsapp" onClick={() => onOpen(product, selected, photo, true)} aria-label={`Заказать ${product.name}`}><MessageCircle size={16}/> Заказать</button><button type="button" className="card-compose" onClick={() => onOpen(product, selected, photo)}>Подробнее <ArrowUpRight size={14}/></button></div>
  </motion.article>;
}

function Detail({ product, selected, onSelect, onClose, ordering }: { product: Product; selected: Variant; onSelect: (variant: Variant, photo?: string) => void; onClose: () => void; ordering: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef(0);
  const initialPhoto = () => { const value = Number(new URLSearchParams(location.search).get('photo') || 0); return Number.isInteger(value) && value >= 0 && value < selected.images.length ? value : 0; };
  const [image, setImage] = useState(initialPhoto);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { setImage(initialPhoto()); }, [selected.id]);
  const gallery = product.variants.flatMap((variant): { variant: Variant; photo: string | undefined }[] => variant.images.length ? variant.images.map((photo) => ({ variant, photo })) : [{ variant, photo: undefined }]);
  const photo = selected.images[image];
  const index = gallery.findIndex((entry) => entry.variant.id === selected.id && entry.photo === photo);
  function move(delta: number) {
    if (gallery.length < 2) return;
    const entry = gallery[(Math.max(index, 0) + delta + gallery.length) % gallery.length];
    onSelect(entry.variant, entry.photo);
    setImage(Math.max(0, entry.variant.images.indexOf(entry.photo || '')));
  }
  const available = availability(product, selected);
  const price = selected.price ?? product.salePrice ?? product.price;
  return <dialog ref={dialog} className={`detail ${ordering ? "order-detail" : ""}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="detail-inner"><button className="detail-close icon-button" onClick={onClose} aria-label="Закрыть"><X/></button>
      <div className="detail-photo" onTouchStart={(event) => { touch.current = event.touches[0].clientX; }} onTouchEnd={(event) => { const delta = event.changedTouches[0].clientX - touch.current; if (Math.abs(delta) > 50) move(delta < 0 ? 1 : -1); }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } }} tabIndex={0} aria-label="Галерея товара">
        {photo ? <img src={photo} alt={`${product.name}, ${selected.name}`}/> : <span>Нет фотографии</span>}
        <GalleryControls index={Math.max(index, 0)} total={gallery.length} onMove={move}/>
      </div>
      <div className="detail-copy">{!ordering && <p className="eyebrow">{product.category.name}</p>}<h2>{product.name}</h2>
        {price !== null && <p className="detail-price">{money(price)}</p>}{!ordering && available !== null && <p className={available ? 'stock' : 'out'}>{available ? '● В наличии' : 'Нет в наличии'}</p>}
        {product.variants.length > 1 && <p className="variant-label">Вариант: <strong>{selected.name}</strong></p>}
        <Swatches product={product} selected={selected} onChange={(variant) => { onSelect(variant); setImage(0); }}/>
        {!ordering && product.description && <p className="description">{product.description}</p>}{!ordering && product.volume && <p><b>Объём / вес:</b> {product.volume}</p>}{!ordering && product.usage && <p><b>Применение:</b> {product.usage}</p>}{!ordering && product.ingredients && <p><b>Состав:</b> {product.ingredients}</p>}
        <WhatsAppComposer key={product.id} product={product} variant={selected} photo={photo}/>
      </div>
    </div>
  </dialog>;
}

export default function Store() {
  const [catalog, setCatalog] = useState<Catalog | null>(null); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [category, setCategory] = useState(''); const [onlyAvailable, setOnlyAvailable] = useState(false); const [sort, setSort] = useState('default'); const [filters, setFilters] = useState(false); const [menu, setMenu] = useState(false); const [active, setActive] = useState<{ product: Product; variant: Variant; ordering: boolean } | null>(null); const reduceMotion = useReducedMotion(); const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { api<Catalog>('/api/catalog').then(setCatalog).catch(() => setError('Не удалось загрузить каталог. Попробуйте позже.')); track('view'); }, []);
  useEffect(() => { if (!catalog) return; const sync = () => { const params = new URLSearchParams(location.search); const product = catalog.products.find((item) => item.id === params.get('product')); if (!product) { setActive(null); return; } const variant = product.variants.find((item) => item.id === params.get('variant')) || product.variants[0]; if (variant) setActive({ product, variant, ordering: history.state?.ordering === true }); }; sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync); }, [catalog]);
  function open(product: Product, variant: Variant, photo?: string, ordering = false) { returnFocus.current = document.activeElement as HTMLElement; history.pushState({ detail: true, ordering }, '', productLink(product, variant, location.origin, photo)); setActive({ product, variant, ordering }); track('product', product.id, variant.id); }
  function select(variant: Variant, photo?: string) { if (!active) return; history.replaceState(history.state, '', productLink(active.product, variant, location.origin, photo)); setActive({ ...active, variant }); }
  function close() { if (history.state?.detail) history.back(); else { history.replaceState(null, '', location.pathname); setActive(null); } setTimeout(() => returnFocus.current?.focus(), 30); }
  const products = (catalog?.products || []).filter((p) => p.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')) && (!category || p.categoryId === category) && (!onlyAvailable || p.variants.some((v) => availability(p, v) === true)));
  if (sort === 'cheap' || sort === 'expensive') products.sort((a, b) => { const first = a.salePrice ?? a.price; const second = b.salePrice ?? b.price; if (first === null) return second === null ? 0 : 1; if (second === null) return -1; return sort === 'cheap' ? first - second : second - first; }); if (sort === 'new') products.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const reset = () => { setQuery(''); setCategory(''); setOnlyAvailable(false); setSort('default'); };
  return <><div className="announcement">КРАСОТА В ДЕТАЛЯХ <span>✦</span> КАТАЛОГ КОСМЕТИКИ</div><header className="header wrap"><a className="brand" href="#top">{catalog?.brand || 'Lumière'}<span> BEAUTY STORE</span></a><nav className={menu ? 'navigation open' : 'navigation'} aria-label="Навигация"><a href="#catalog" onClick={() => setMenu(false)}>Каталог</a><a href="#how" onClick={() => setMenu(false)}>Как заказать</a><a href="#contact" onClick={() => setMenu(false)}>Контакты</a></nav><a href={`https://wa.me/${phone}`} className="header-contact" target="_blank" rel="noreferrer"><MessageCircle size={17}/> Написать нам</a><button className="menu-toggle icon-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menu}>{menu ? <X/> : <Menu/>}</button></header><main id="top"><section className="hero"><motion.img src="/images/hero.webp" alt="Косметические средства в мягком свете" fetchPriority="high" animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.055, 1], x: [0, -7, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}/><div className="hero-shade"/><motion.div className="hero-content wrap" initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}><p className="eyebrow light">ВАШ МОМЕНТ ДЛЯ СЕБЯ <span>✦</span></p><h1>Красота начинается<br/><em>с заботы о себе.</em></h1><p>Любимые средства для маленьких ритуалов каждый день. Найдите то, что подходит именно вам.</p><a className="button hero-button" href="#catalog">Смотреть каталог <ArrowDown size={18}/></a></motion.div><span className="hero-side">BEAUTY IN EVERY DETAIL — 01 / 01</span></section><div className="intro-strip"><span>ВЫБИРАЙТЕ С УДОВОЛЬСТВИЕМ</span><span>✦</span><span>ЗАКАЗЫВАЙТЕ В WHATSAPP</span><span>✦</span><span>НАХОДИТЕ СВОЁ</span></div><section className="catalog-section wrap" id="catalog"><div className="section-heading"><div><p className="eyebrow">КРАСОТА НАЧИНАЕТСЯ ЗДЕСЬ</p><h2>Найдите <em>своё.</em></h2><p>Всё для ваших любимых ритуалов красоты.</p></div><span className="heading-mark">01 / КАТАЛОГ</span></div><div className="category-line"><button className={!category ? 'active' : ''} onClick={() => setCategory('')}>Все продукты</button>{catalog?.categories.filter((item) => catalog.products.some((product) => product.categoryId === item.id)).map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div><div className="toolbar"><label className="search"><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти продукт" aria-label="Поиск по названию"/></label><button className="filter-toggle" onClick={() => setFilters(!filters)} aria-expanded={filters}><SlidersHorizontal size={18}/> Фильтры <ChevronDown size={15}/></button><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка"><option value="default">По умолчанию</option><option value="new">Сначала новые</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select></div>{filters && <div className="filter-panel"><label><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)}/> Только в наличии</label><button onClick={reset}>Сбросить фильтры</button></div>}<div className="results"><span>{catalog ? `Найдено: ${products.length}` : 'Загрузка каталога…'}</span><button onClick={reset}>Сбросить фильтры</button></div>{error && <p role="alert" className="empty">{error}</p>}{catalog && products.length === 0 && <div className="empty"><h3>Пока ничего не найдено</h3><p>Попробуйте изменить поиск или фильтры.</p><button onClick={reset}>Сбросить фильтры</button></div>}<div className="products">{products.map((product) => <ProductCard key={product.id} product={product} onOpen={open}/>)}</div></section><section className="how" id="how"><div className="wrap how-layout"><div><p className="eyebrow">ПРОСТО И УДОБНО</p><h2>Понравилось?<br/><em>Заказать легко.</em></h2><p>Выберите продукт и вариант, а затем напишите нам в WhatsApp.</p><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="text-link">Связаться с нами <ArrowUpRight size={18}/></a></div><div className="steps"><div><span>01</span><p><b>Выберите продукт</b><small>Найдите в каталоге то, что вам нравится.</small></p><Check size={18}/></div><div><span>02</span><p><b>Укажите вариант</b><small>Посмотрите фотографии и выберите подходящий вариант.</small></p><Check size={18}/></div><div><span>03</span><p><b>Напишите нам</b><small>Отправьте фото товара и напишите свой вопрос.</small></p><Check size={18}/></div></div></div></section></main><footer id="contact"><div className="wrap footer-inner"><div><a className="brand" href="#top">{catalog?.brand || 'Lumière'}<span> BEAUTY STORE</span></a><p>Красота начинается с заботы о себе.</p></div><div><p className="eyebrow">МЫ НА СВЯЗИ</p><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">+992 90 648 00 08 <ArrowUpRight size={16}/></a></div></div><div className="wrap footer-bottom"><span>© {new Date().getFullYear()} {catalog?.brand || 'Lumière'}</span></div></footer>{active && <Detail ordering={active.ordering} product={active.product} selected={active.variant} onSelect={select} onClose={close}/>}</>;
}
