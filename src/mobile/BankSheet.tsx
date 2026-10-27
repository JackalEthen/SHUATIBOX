import { useState } from 'react';
import { errorText, deleteBank, revalidateBank, switchBank, type BankDto, type Bootstrap } from '../api';
import { MobileSheet } from '../MobileSheet';

interface Props {
  open: boolean;
  data: Bootstrap;
  onClose: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
  onImport: () => void;
}

export function BankSheet({ open, data, onClose, onNotice, onRefresh, onImport }: Props) {
  const [busy, setBusy] = useState('');

  const run = async (id: string, action: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await action();
      onNotice(done);
      onRefresh();
    } catch (error) {
      onNotice(errorText(error));
    } finally {
      setBusy('');
    }
  };

  const item = (bank: BankDto) => (
    <button
      key={bank.id}
      className="w-full text-left rounded-xl border p-3.5 flex items-center gap-3"
      style={bank.active ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}
      disabled={!!busy}
      onClick={() => {
        if (bank.active) return;
        void run(bank.id, () => switchBank(bank.id), `已切换到 ${bank.title}`);
      }}
    >
      <div className="w-8 h-8 rounded-lg bg-[var(--card)] text-[var(--accent-ink)] grid place-items-center text-[11px] font-semibold">
        {bank.title.slice(0, 1)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate">{bank.title}</div>
        <div className="text-[9.5px] text-[var(--muted)] mt-0.5">
          {bank.paperCount} 套卷 · {bank.questionCount.toLocaleString('zh-CN')} 题
        </div>
      </div>
      {bank.active ? (
        <span className="chip active">启用中</span>
      ) : (
        <span className="text-[10px] text-[var(--muted)]">{busy === bank.id ? '…' : '切换'}</span>
      )}
    </button>
  );

  return (
    <MobileSheet open={open} onClose={onClose}>
      <div className="grabber" />
      <h3 className="text-[14px] font-semibold">切换题库</h3>
      <p className="text-[10px] text-[var(--muted)] mt-1">多个题库互斥，切换后进度、错题、统计随题库切换。</p>

      <div className="mt-4 space-y-2">{data.banks.map(item)}</div>

      <div className="flex gap-2 mt-3">
        <button className="btn btn-ghost btn-sm flex-1" onClick={onImport}>导入新题库</button>
        <button
          className="btn btn-ghost btn-sm flex-1"
          disabled={!!busy}
          onClick={() => void run(data.bank.id, () => revalidateBank(data.bank.id), '校验完成')}
        >
          校验当前
        </button>
        {!data.bank.active || data.banks.length > 1 ? (
          <button
            className="btn btn-danger btn-sm flex-1"
            disabled={!!busy}
            onClick={() => {
              if (data.bank.active) {
                onNotice('请先切换到其他题库，再删除当前题库');
                return;
              }
              void run(data.bank.id, () => deleteBank(data.bank.id), '已删除');
            }}
          >
            删除当前
          </button>
        ) : null}
      </div>

      <button className="btn btn-primary btn-block mt-4" onClick={onClose}>关闭</button>
      <div className="h-4" />
    </MobileSheet>
  );
}