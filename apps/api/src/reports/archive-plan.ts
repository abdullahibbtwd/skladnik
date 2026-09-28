export type ArchiveCapture = { pageNumber: number; imageKey: string; sourceKey: string | null };

export type ArchiveDocument = {
  id: string;
  /** Supplier, or the document type when there is no partner (e.g. a write-off). */
  partyName: string;
  number: string;
  issuedOn: string;
  site: string;
  captures: ArchiveCapture[];
};

export type ArchiveFile = { name: string; key: string; documentId: string; pageNumber: number };

/** Safe on Windows, macOS and Linux: no path separators, reserved characters or leading dots. */
export function safeNamePart(value: string, max = 60) {
  const cleaned = value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, max)
    .trim();
  return cleaned || '_';
}

export function extensionOf(key: string) {
  const match = /\.([a-z0-9]{2,5})$/i.exec(key);
  return match ? match[1].toLowerCase() : 'bin';
}

function unique(name: string, used: Set<string>) {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let copy = 2; ; copy += 1) {
    const candidate = `${stem} (${copy})${ext}`;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/**
 * Files named supplier_number_date (§4.8). A PDF upload is included once as the original PDF rather
 * than its rendered pages; photos keep a _p<page> suffix when a document has more than one file.
 */
export function planArchive(documents: ArchiveDocument[], options: { siteFolders: boolean }) {
  const used = new Set<string>();
  const files: ArchiveFile[] = [];
  for (const doc of documents) {
    const seenSources = new Set<string>();
    const items: { key: string; pageNumber: number; ext: string }[] = [];
    for (const capture of [...doc.captures].sort((a, b) => a.pageNumber - b.pageNumber)) {
      if (capture.sourceKey) {
        if (seenSources.has(capture.sourceKey)) continue;
        seenSources.add(capture.sourceKey);
        items.push({ key: capture.sourceKey, pageNumber: capture.pageNumber, ext: 'pdf' });
      } else {
        items.push({ key: capture.imageKey, pageNumber: capture.pageNumber, ext: extensionOf(capture.imageKey) });
      }
    }
    const folder = options.siteFolders ? `${safeNamePart(doc.site)}/` : '';
    const base = `${safeNamePart(doc.partyName)}_${safeNamePart(doc.number, 40)}_${doc.issuedOn}`;
    for (const item of items) {
      const suffix = items.length > 1 ? `_p${item.pageNumber}` : '';
      files.push({
        name: unique(`${folder}${base}${suffix}.${item.ext}`, used),
        key: item.key,
        documentId: doc.id,
        pageNumber: item.pageNumber,
      });
    }
  }
  return files;
}
