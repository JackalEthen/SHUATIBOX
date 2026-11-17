import { useEffect, useState } from 'react';
import { errorText, listFonts, pickFontFile, saveFont, type FontDto } from './api';
import { t } from './i18n';

interface Props {
  appFont: string;
  practiceFont: string;
  setAppFont: (value: string) => void;
  setPracticeFont: (value: string) => void;
  onNotice: (message: string) => void;
  mobile?: boolean;
}

function FontSelect({ value, onChange, fonts }: { value: string; onChange: (value: string) => void; fonts: FontDto[] }) {
  return (
    <select className="chip bg-transparent w-full" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="system">{t('系统默认')}</option>
      <option value="hei">{t('黑体')}</option>
      <option value="serif">{t('宋体')}</option>
      {fonts.map((font) => (
        <option key={font.path} value={`custom:${font.path}`}>{font.name}</option>
      ))}
      {value.startsWith('custom:') && !fonts.some((font) => `custom:${font.path}` === value) ? (
        <option value={value}>{t('已导入字体')}</option>
      ) : null}
    </select>
  );
}

export function FontSettings({ appFont, practiceFont, setAppFont, setPracticeFont, onNotice, mobile }: Props) {
  const [fonts, setFonts] = useState<FontDto[]>([]);

  useEffect(() => {
    listFonts().then(setFonts).catch(() => undefined);
  }, []);

  const pickFont = async () => {
    try {
      const source = await pickFontFile(t('字体文件'));
      if (!source) return;
      const saved = await saveFont(source);
      setFonts(await listFonts());
      setPracticeFont(`custom:${saved}`);
      onNotice(t('字体已导入'));
    } catch (error) {
      onNotice(t('导入字体失败：{p0}', { p0: errorText(error) }));
    }
  };

  return (
    <div className={mobile ? 'card mt-3 p-4' : 'card mt-4 p-5'}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className={mobile ? 'text-[15px] font-semibold' : 'text-[13.5px] font-semibold'}>{t('字体')}</div>
          <div className="text-[10.5px] text-[var(--muted)] mt-1">{t('全应用与做题页可分别设置')}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void pickFont()}>{t('导入字体')}</button>
      </div>
      <div className={mobile ? 'mt-3 space-y-3' : 'mt-4 grid grid-cols-2 gap-4'}>
        <label className="block">
          <div className="text-[11.5px] text-[var(--muted)] mb-1">{t('全应用字体')}</div>
          <FontSelect value={appFont} onChange={setAppFont} fonts={fonts} />
        </label>
        <label className="block">
          <div className="text-[11.5px] text-[var(--muted)] mb-1">{t('做题页字体')}</div>
          <FontSelect value={practiceFont} onChange={setPracticeFont} fonts={fonts} />
        </label>
      </div>
      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4">
        <div className="text-[11px] text-[var(--muted)]">{t('界面文字预览')}</div>
        <div className="text-[12.5px] mt-1">{t('设置 · 首页 · 题库 · 错题')}</div>
        <div className="qtext text-[13px] mt-3">{t('示例题目：下列哪项最符合题意？')}</div>
        <div className="opt mt-2">
          <span className="opt-key">A</span>
          <span>{t('示例选项')}</span>
        </div>
      </div>
    </div>
  );
}
