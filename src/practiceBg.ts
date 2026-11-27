import type { CSSProperties } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface PracticeBg {
  color: string;
  image: string;
}

const COLOR_KEY = 'practice-bg-color';
const IMAGE_KEY = 'practice-bg-image';

export function loadPracticeBg(): PracticeBg {
  return {
    color: localStorage.getItem(COLOR_KEY) ?? '',
    image: localStorage.getItem(IMAGE_KEY) ?? '',
  };
}

export function persistPracticeBg(bg: PracticeBg) {
  if (bg.color) localStorage.setItem(COLOR_KEY, bg.color);
  else localStorage.removeItem(COLOR_KEY);
  if (bg.image) localStorage.setItem(IMAGE_KEY, bg.image);
  else localStorage.removeItem(IMAGE_KEY);
}

export function backgroundImageUrl(image: string): string {
  if (image.startsWith('builtin:')) return `/background/${image.slice(8)}`;
  return convertFileSrc(image);
}

export function practiceBgStyle(bg: PracticeBg): CSSProperties {
  const style: CSSProperties = {};
  if (bg.image) {
    const url = backgroundImageUrl(bg.image).replace(/"/g, '%22');
    style.backgroundImage = `url("${url}")`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }
  if (bg.color) style.backgroundColor = bg.color;
  return style;
}
