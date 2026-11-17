'use client';
import { useEffect, useState } from 'react';

type LabelSet = { id: number; name: string; count: number };
type Label = {
  id: number; setId: number; sku: string | null; title: string; text: string; align: 'center' | 'left';
  showMark: boolean; barcode: string; noPrint: boolean; extraLabelId: number | null; fits: boolean; updatedAt: string;
};
type BarcodeMode = 'auto' | 'manual' | 'none';

async function send(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<{ error: string | null; data?: unknown }> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return res.ok ? { error: null, data: j } : { error: j.issues?.[0]?.message ?? j.error ?? 'Помилка' };
}
const nameOf = (l: Label) => l.title || l.text.split('\n')[0]!.slice(0, 70);

export function LabelsClient({ isAdmin }: { isAdmin: boolean }) {
  const [sets, setSets] = useState<LabelSet[]>([]);
  const [setId, setSetId] = useState<number | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Label | 'new' | null>(null);
  const [error, setError] = useState('');

  const loadSets = async () => {
    const res = await fetch('/api/label-sets');
    if (!res.ok) return;
    const s: LabelSet[] = await res.json();
    setSets(s);
    setSetId(cur => cur ?? s[0]?.id ?? null);
  };
  const loadLabels = async (id = setId, query = q) => {
    if (!id) return;
    const res = await fetch(`/api/label-sets/${id}/labels${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
    if (res.ok) setLabels(await res.json()); else setError((await res.json().catch(() => ({}))).error ?? 'Помилка');
  };
  useEffect(() => { void loadSets(); }, []);
  useEffect(() => { setEdit(null); void loadLabels(setId, q); }, [setId]);

  async function addSet() {
    const name = prompt('Назва нового набору наклейок (з’явиться кнопка «Наклейки: …» у накладних)');
    if (!name?.trim()) return;
    const r = await send('/api/label-sets', 'POST', { name });
    if (r.error) { setError(r.error); return; }
    await loadSets();
    setSetId((r.data as LabelSet).id);
  }
  async function remove(l: Label) {
    if (!confirm(`Остаточно видалити наклейку ${l.sku ?? `«${l.title}»`}? Це не можна скасувати.`)) return;
    const r = await send(`/api/labels/${l.id}`, 'DELETE');
    if (r.error) { setError(r.error); return; }
    setEdit(null);
    await Promise.all([loadLabels(), loadSets()]);
  }
  const helpers = labels.filter(l => !l.sku);
  const titleById = new Map(labels.map(l => [l.id, l.sku ?? l.title]));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Наклейки</h1>
        <div className="row">
          <button onClick={addSet}>+ Набір</button>
          <button className="primary" disabled={!setId} onClick={() => { setEdit('new'); setError(''); }}>+ Нова наклейка</button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {sets.map(s => (
          <button key={s.id} role="tab" aria-selected={s.id === setId} onClick={() => setSetId(s.id)}>{s.name} ({s.count})</button>
        ))}
      </div>

      <form className="card row" onSubmit={e => { e.preventDefault(); void loadLabels(); }}>
        <div style={{ flex: 1 }}><label htmlFor="lq">Пошук: артикул або текст</label><input id="lq" style={{ width: '100%' }} value={q} onChange={e => setQ(e.target.value)} /></div>
        <button>Знайти</button>
      </form>
      {error && <div className="card error">{error}</div>}

      {edit && setId && (
        <LabelForm
          key={edit === 'new' ? 'new' : `${edit.id}-${edit.updatedAt}`}
          setId={setId} label={edit === 'new' ? null : edit} helpers={helpers.filter(h => edit === 'new' || h.id !== edit.id)} isAdmin={isAdmin}
          onSaved={async saved => { setError(''); await Promise.all([loadLabels(), loadSets()]); setEdit(saved); }}
          onCancel={() => setEdit(null)} onError={setError} onDelete={remove}
        />
      )}

      <div className="card">
        <table>
          <thead><tr><th>Артикул</th><th>Назва</th><th>Штрихкод</th><th>Позначки</th><th></th></tr></thead>
          <tbody>
            {labels.length === 0 && <tr><td colSpan={5} className="muted">Наклейок немає</td></tr>}
            {labels.map(l => (
              <tr key={l.id}>
                <td>{l.sku ?? <span className="muted">службова</span>}</td>
                <td>{nameOf(l)}</td>
                <td>{l.barcode || <span className="muted">без штрихкоду</span>}</td>
                <td>
                  {l.noPrint && <span className="pill warn">не друкувати</span>}{' '}
                  {l.extraLabelId && <span className="pill">+ {titleById.get(l.extraLabelId) ?? 'додаткова'}</span>}{' '}
                  {l.showMark && <span className="pill">знак</span>}{' '}
                  {!l.fits && <span className="pill warn">⚠ не вміщається</span>}
                </td>
                <td className="num"><button onClick={() => { setEdit(l); setError(''); }}>Змінити</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LabelForm({ setId, label, helpers, isAdmin, onSaved, onCancel, onError, onDelete }: {
  setId: number; label: Label | null; helpers: Label[]; isAdmin: boolean;
  onSaved: (l: Label) => Promise<void>; onCancel: () => void; onError: (e: string) => void; onDelete: (l: Label) => Promise<void>;
}) {
  const [sku, setSku] = useState(label?.sku ?? '');
  const autoBarcode = label ? (label.barcode === '' ? 'none' : 'auto') : 'auto';
  const [mode, setMode] = useState<BarcodeMode>(autoBarcode);
  const [manual, setManual] = useState(label?.barcode ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const extra = String(f.get('extra') ?? '');
    const body = {
      sku: sku.trim() || null,
      title: String(f.get('title') ?? ''),
      text: String(f.get('text') ?? ''),
      align: f.get('align') === 'left' ? 'left' : 'center',
      showMark: f.get('showMark') === 'on',
      noPrint: f.get('noPrint') === 'on',
      barcode: mode === 'none' ? '' : mode === 'manual' ? manual.trim() : null,
      extraLabelId: extra ? Number(extra) : null,
    };
    setBusy(true);
    const r = label ? await send(`/api/labels/${label.id}`, 'PATCH', body) : await send(`/api/label-sets/${setId}/labels`, 'POST', body);
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    await onSaved(r.data as Label);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{label ? `Наклейка ${label.sku ?? `«${label.title}»`}` : 'Нова наклейка'}</h2>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <div className="row">
            <div><label htmlFor="l-sku">Артикул (4 цифри; порожньо — службова)</label><input id="l-sku" value={sku} onChange={e => setSku(e.target.value)} maxLength={4} style={{ width: 110 }} /></div>
            {!sku.trim() && <div style={{ flex: 1 }}><label htmlFor="l-title">Назва службової наклейки</label><input id="l-title" name="title" defaultValue={label?.title ?? ''} style={{ width: '100%' }} /></div>}
          </div>
          <label htmlFor="l-text" style={{ marginTop: 10 }}>Текст наклейки</label>
          <textarea id="l-text" name="text" defaultValue={label?.text ?? ''} style={{ minHeight: 180 }} />
          <div className="row" style={{ marginTop: 10 }}>
            <div><label htmlFor="l-align">Вирівнювання</label>
              <select id="l-align" name="align" defaultValue={label?.align ?? 'center'}><option value="center">по центру</option><option value="left">зліва</option></select></div>
            <div><label htmlFor="l-bc">Штрихкод</label>
              <select id="l-bc" value={mode} onChange={e => setMode(e.target.value as BarcodeMode)}>
                <option value="auto">за артикулом</option><option value="manual">вручну</option><option value="none">без штрихкоду</option>
              </select></div>
            {mode === 'manual' && <div><label htmlFor="l-bcv">EAN-13</label><input id="l-bcv" value={manual} onChange={e => setManual(e.target.value)} maxLength={13} /></div>}
            <div><label htmlFor="l-extra">Друкувати після кожної штуки</label>
              <select id="l-extra" name="extra" defaultValue={label?.extraLabelId ?? ''}>
                <option value="">—</option>
                {helpers.map(h => <option key={h.id} value={h.id}>{h.title || h.sku}</option>)}
              </select></div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, color: 'inherit' }}><input type="checkbox" name="showMark" defaultChecked={label?.showMark ?? false} /> Знак відповідності</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, color: 'inherit' }}><input type="checkbox" name="noPrint" defaultChecked={label?.noPrint ?? false} /> Не друкувати</label>
          </div>
          {label && !label.fits && <div className="error">Текст не вміщається на наклейку навіть найдрібнішим шрифтом — скоротіть його.</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="primary" disabled={busy}>Зберегти</button>
            <button type="button" onClick={onCancel}>Закрити</button>
            {label && isAdmin && <button type="button" onClick={() => onDelete(label)}>Видалити</button>}
          </div>
        </div>
        {label && (
          <div>
            <label>Як буде надруковано</label>
            <iframe title="Перегляд наклейки" className="label-preview" src={`/api/labels/${label.id}/preview?v=${encodeURIComponent(label.updatedAt)}#toolbar=0&view=Fit`} />
          </div>
        )}
      </div>
    </form>
  );
}
