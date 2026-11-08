import { useEffect, useId, useState } from 'react';
import { Download, ImageUp, MessageCircle } from 'lucide-react';
import type { Product, Variant } from '../shared/schema';
import { track } from './api';
import { chatLink, orderMessage } from './whatsapp';

// Prepare the file before the click: native sharing needs the user's activation.
async function loadPhoto(url: string, signal: AbortSignal, caption: string) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Photo unavailable');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Invalid photo');
  const bitmap = await createImageBitmap(blob);
  try {
    // Render a shareable product card so WhatsApp cannot drop the name or price
    // when a receiving app ignores Web Share's text alongside a file.
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo conversion unavailable');
    context.font = '40px Arial, sans-serif';
    const lines: string[] = [];
    for (const paragraph of caption.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        if (line && context.measureText(`${line} ${word}`).width > 880) { lines.push(line); line = ''; }
        for (const char of `${line ? ' ' : ''}${word}`) {
          if (context.measureText(line + char).width > 880) { lines.push(line); line = ''; }
          line += char;
        }
      }
      if (line) lines.push(line);
    }
    const imageHeight = 1120;
    canvas.height = imageHeight + 72 + lines.length * 52;
    context.fillStyle = '#fbf8f5'; context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(920 / bitmap.width, 1080 / bitmap.height);
    const width = bitmap.width * scale; const height = bitmap.height * scale;
    context.drawImage(bitmap, (1000 - width) / 2, (imageHeight - height) / 2, width, height);
    context.strokeStyle = '#e8deda'; context.beginPath(); context.moveTo(60, imageHeight); context.lineTo(940, imageHeight); context.stroke();
    context.fillStyle = '#302528'; context.font = '40px Arial, sans-serif'; context.textBaseline = 'top';
    lines.forEach((line, index) => context.fillText(line, 60, imageHeight + 32 + index * 52));
    const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Photo conversion failed')), 'image/png'));
    return new File([image], 'product-photo.png', { type: 'image/png' });
  } finally { bitmap.close(); }
}

export default function WhatsAppComposer({ product, variant, photo }: { product: Product; variant: Variant; photo?: string }) {
  const inputId = useId();
  const [note, setNote] = useState('');
  const [prepared, setPrepared] = useState<{ url: string; file: File; downloadUrl: string } | null>(null);
  const [photoState, setPhotoState] = useState<'loading' | 'ready' | 'fallback'>('fallback');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const caption = orderMessage(product, variant);
  useEffect(() => {
    setPrepared(null); setError('');
    if (!photo) { setPhotoState('fallback'); return; }
    const controller = new AbortController();
    let downloadUrl = '';
    setPhotoState('loading');
    loadPhoto(photo, controller.signal, caption).then((file) => {
      if (controller.signal.aborted) return;
      downloadUrl = URL.createObjectURL(file);
      setPrepared({ url: photo, file, downloadUrl });
      setPhotoState(typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) ? 'ready' : 'fallback');
    }).catch(() => { if (!controller.signal.aborted) setPhotoState('fallback'); });
    return () => { controller.abort(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); };
  }, [photo, caption]);

  async function sharePhoto() {
    if (!prepared || prepared.url !== photo || sharing) return;
    setError(''); setSharing(true);
    try {
      track('whatsapp', product.id, variant.id);
      await navigator.share({ files: [prepared.file], ...(note.trim() ? { text: note.trim() } : {}), title: product.name });
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setError('Не удалось открыть отправку. Скачайте фото и прикрепите его в WhatsApp.');
    } finally { setSharing(false); }
  }

  return <div className="whatsapp-composer">
    <label htmlFor={inputId}>Ваше сообщение</label>
    <textarea id={inputId} value={note} maxLength={1500} rows={3} onChange={(event) => setNote(event.target.value)} />
    {photo && photoState !== 'fallback' && <button type="button" className="button primary order" onClick={sharePhoto} disabled={sharing || !prepared || prepared.url !== photo}><ImageUp size={18}/>{sharing ? 'Открываем…' : photoState === 'loading' ? 'Подготовка фото…' : 'Отправить фото в WhatsApp'}</button>}
    {photoState === 'ready' && <p className="share-hint">Выберите WhatsApp и контакт +992 90 648 00 08.</p>}
    <div className="order-alternatives">
      {photo && <a className="photo-download" href={prepared?.url === photo ? prepared.downloadUrl : photo} download={prepared?.url === photo ? prepared.file.name : undefined}><Download size={15}/> Скачать фото</a>}
      <a className={photoState === 'fallback' ? 'button primary order' : 'open-chat-link'} href={chatLink(note)} target="_blank" rel="noreferrer" onClick={() => track('whatsapp', product.id, variant.id)}><MessageCircle size={17}/> Открыть чат</a>
    </div>
    {photo && photoState === 'fallback' && <p className="share-hint">Скачайте фото и прикрепите его в чате.</p>}
    {error && <p role="alert" className="small-note error">{error}</p>}
  </div>;
}
