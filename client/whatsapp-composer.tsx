import { useEffect, useId, useState } from 'react';
import { Download, ImageUp, MessageCircle } from 'lucide-react';
import type { Product, Variant } from '../shared/schema';
import { track } from './api';
import { orderLink, orderMessage } from './whatsapp';

// Prepare the file before the click: native sharing needs the user's activation.
async function loadPhoto(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Photo unavailable');
  let blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Invalid photo');
  if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo conversion unavailable');
      context.drawImage(bitmap, 0, 0);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Photo conversion failed')), 'image/png'));
    } finally { bitmap.close(); }
  }
  return new File([blob], `product-photo.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: blob.type });
}

export default function WhatsAppComposer({ product, variant, photo }: { product: Product; variant: Variant; photo?: string }) {
  const inputId = useId();
  const [note, setNote] = useState('');
  const [prepared, setPrepared] = useState<{ url: string; file: File; downloadUrl: string } | null>(null);
  const [photoState, setPhotoState] = useState<'loading' | 'ready' | 'fallback'>('fallback');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPrepared(null); setError('');
    if (!photo) { setPhotoState('fallback'); return; }
    const controller = new AbortController();
    let downloadUrl = '';
    setPhotoState('loading');
    loadPhoto(photo, controller.signal).then((file) => {
      if (controller.signal.aborted) return;
      downloadUrl = URL.createObjectURL(file);
      setPrepared({ url: photo, file, downloadUrl });
      setPhotoState(typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) ? 'ready' : 'fallback');
    }).catch(() => { if (!controller.signal.aborted) setPhotoState('fallback'); });
    return () => { controller.abort(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); };
  }, [photo]);

  async function sharePhoto() {
    if (!prepared || prepared.url !== photo || sharing) return;
    setError(''); setSharing(true);
    try {
      await navigator.share({ files: [prepared.file], text: orderMessage(product, variant, note, photo), title: product.name });
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setError('Не удалось открыть отправку. Скачайте фото и прикрепите его в WhatsApp.');
    } finally { setSharing(false); }
  }

  return <div className="whatsapp-composer">
    <label htmlFor={inputId}>Ваше сообщение <span>необязательно</span></label>
    <textarea id={inputId} value={note} maxLength={1500} rows={3} placeholder="Например: хочу 2 штуки. Есть доставка?" onChange={(event) => setNote(event.target.value)} />
    <a className="button primary order" href={orderLink(product, variant, note, photo)} target="_blank" rel="noreferrer" onClick={() => track('whatsapp', product.id, variant.id)}><MessageCircle size={18}/> Написать в WhatsApp</a>
    <p className="small-note">Откроется чат +992 90 648 00 08 с вашим текстом и ссылкой на выбранное фото. Нажмите «Отправить» в WhatsApp.</p>
    {photo && <>
      {photoState !== 'fallback' && <button type="button" className="button photo-share" onClick={sharePhoto} disabled={sharing || !prepared || prepared.url !== photo}><ImageUp size={18}/>{sharing ? 'Открываем…' : photoState === 'loading' ? 'Подготовка фото…' : 'Отправить фото и текст'}</button>}
      <a className="photo-download" href={prepared?.url === photo ? prepared.downloadUrl : photo} download={prepared?.url === photo ? prepared.file.name : undefined}><Download size={15}/> Скачать фото</a>
      <p className="small-note">{photoState === 'fallback' ? 'Скачайте фото и прикрепите его в чате WhatsApp.' : 'Для отправки файлом выберите WhatsApp и контакт +992 90 648 00 08 в меню телефона. Если текст не перенёсся, отправьте его кнопкой выше.'}</p>
    </>}
    {error && <p role="alert" className="small-note error">{error}</p>}
  </div>;
}
