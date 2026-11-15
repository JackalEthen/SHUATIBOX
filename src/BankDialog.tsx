import { t, fmtNumber } from './i18n';
import { useState } from 'react';
import {
  deleteBank,
  errorText,
  revalidateBank,
  switchBank,
  type BankDto,
  type Bootstrap,
} from './api';
import { Modal } from './Modal';
import { BankRenameDialog } from './BankRenameDialog';

interface Props {
  open: boolean;
  data: Bootstrap;
  onClose: () => void;
  onRefresh: () => void;
  onImport: () => void;
  onNotice: (message: string) => void;
}

export function BankDialog({ open, data, onClose, onRefresh, onImport, onNotice }: Props) {
  const [confirm, setConfirm] = useState<BankDto | null>(null);
  const [rename, setRename] = useState<BankDto | null>(null);

  return (
    <>
      <Modal
        open={open}
        title={t("切换题库")}
        onClose={onClose}
        wide
        footer={
          <>
            <button className="btn btn-ghost" onClick={onClose}>{t("关闭")}</button>
            <button className="btn btn-primary" onClick={() => { onClose(); onImport(); }}>
              {t("导入题库")}
            </button>
          </>
        }
      >
        <div className="text-[10.5px] text-[var(--muted)] leading-5">
          {t("多个题库互斥，同一时间仅一个启用。切换后进度、错题、统计随题库切换。")}
        </div>
        <div className="mt-3 divide-y divide-[var(--line)]">
          {data.banks.map((bank) => (
            <div key={bank.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium">
                  {bank.title}
                  {bank.active ? <span className="chip-accent ml-2">{t("启用中")}</span> : null}
                </div>
                <div className="text-[10.5px] text-[var(--muted)] mt-0.5 truncate">
                  {fmtNumber(bank.questionCount)}  {t("题 ·")} {bank.paperCount}  {t("套卷 ·")} {bank.importedAt}
                </div>
              </div>
              {!bank.active ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    switchBank(bank.id)
                      .then(() => {
                        onNotice(t("题库已切换"));
                        onClose();
                        onRefresh();
                      })
                      .catch((error) => onNotice(t("切换失败：{p0}", { p0: errorText(error) })))
                  }
                >
                  {t("启用")}
                </button>
              ) : null}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  revalidateBank(bank.id)
                    .then(() => {
                      onNotice(t("校验完成"));
                      onRefresh();
                    })
                    .catch((error) => onNotice(t("校验失败：{p0}", { p0: errorText(error) })))
                }
              >
                {t("校验")}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRename(bank)}>{t("重命名")}</button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm(bank)}>{t("删除")}</button>
            </div>
          ))}
        </div>
      </Modal>

      <BankRenameDialog
        open={!!rename}
        bank={rename}
        onClose={() => setRename(null)}
        onSaved={onRefresh}
        onNotice={onNotice}
      />

      <Modal
        open={!!confirm}
        title={t("删除题库？")}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>{t("取消")}</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirm) return;
                deleteBank(confirm.id)
                  .then(() => {
                    setConfirm(null);
                    onNotice(t("题库已删除"));
                    onRefresh();
                  })
                  .catch((error) => onNotice(t("删除失败：{p0}", { p0: errorText(error) })));
              }}
            >
              {t("确认删除")}
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-7 text-[var(--ink-2)]">
          {t("将删除题库文件、该题库的进度、错题、笔记与收藏。此操作不可撤销。")}
        </p>
      </Modal>
    </>
  );
}
