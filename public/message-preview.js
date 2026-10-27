// Keep live events and persisted DM snapshots consistent without revealing spoilers.
const DOCUMENT_TYPES = /^(application\/(pdf|msword|vnd\.(?:openxmlformats|ms-|oasis)|rtf)|text\/)/i;
export function messagePreview(message) {
  if (!message) return 'No messages yet';
  if (message.text?.trim()) return message.text.replace(/\s+/g, ' ').trim();
  const files = Array.isArray(message.attachments) ? message.attachments : [];
  if (files.length > 1) return `${files.length} attachments`;
  const file = files[0];
  if (!file) return 'Message';
  if (file.spoiler) return 'Spoiler attachment';
  const type = file.type || file.mime || '';
  if (file.gifId || file.provider || type === 'image/gif') return 'GIF';
  if (type.startsWith('image/')) return 'Photo';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  return `${DOCUMENT_TYPES.test(type) ? 'Document' : 'File'}${file.name ? ` · ${file.name}` : ''}`;
}
