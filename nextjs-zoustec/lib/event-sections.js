/**
 * Config-driven event sections (spec §III.2: mỗi loại sự kiện tự sinh kiến
 * trúc website khác nhau). Content sống trong event.config.sections:
 *
 *   notice    {type, style?: 'warning', title, items: [string]}
 *   info-list {type, title, items: [{label, value}]}
 *   places    {type, title, items: [{name, description}]}
 *   text      {type, title, paragraphs: [string]}
 *
 * Wizard seeds DEFAULT_SECTIONS[type]; builder edits; experience renders.
 */

export const DEFAULT_SECTIONS = {
  city: [
    {
      type: 'places',
      title: '景點導覽',
      items: [
        { name: '（範例）古蹟地標', description: '編輯此區塊，介紹活動收錄的景點。' },
        { name: '（範例）文化園區', description: '每個停靠點都有自己的故事。' },
      ],
    },
    {
      type: 'text',
      title: '文化小知識',
      paragraphs: ['在此撰寫給旅客的文化背景與故事 — 每個檢查點都是城市故事的一章。'],
    },
  ],
  hiking: [
    {
      type: 'notice',
      style: 'warning',
      title: '安全提醒',
      items: [
        '每人至少攜帶 1 公升飲用水。',
        '雨後石階濕滑，請穿著止滑鞋。',
        '緊急電話：119（山域救援）。',
      ],
    },
    {
      type: 'info-list',
      title: '路線資訊',
      items: [
        { label: '距離', value: '（編輯）如 1.5 km 單程' },
        { label: '爬升', value: '（編輯）如 +183 m' },
        { label: '難度', value: '（編輯）如 中等' },
      ],
    },
  ],
  shopping: [
    {
      type: 'places',
      title: '參與店家',
      items: [
        { name: '（範例）美食街 B1', description: '單筆消費滿額即可蓋章。' },
        { name: '（範例）中庭活動舞台', description: '週末品牌活動 13:00–18:00。' },
      ],
    },
    {
      type: 'notice',
      title: '消費任務說明',
      items: ['請保留發票 — 服務台人員將核對消費。', '印章需於消費當日領取。'],
    },
  ],
};

/** Editor helpers: sections ↔ plain textarea text (one entry per line). */
export function sectionBodyToText(s) {
  if (s.type === 'text') return (s.paragraphs || []).join('\n');
  if (s.type === 'info-list') return (s.items || []).map((i) => `${i.label} | ${i.value}`).join('\n');
  if (s.type === 'places') return (s.items || []).map((i) => `${i.name} | ${i.description || ''}`).join('\n');
  return (s.items || []).join('\n'); // notice
}

export function textToSectionBody(s, text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  if (s.type === 'text') return { paragraphs: lines };
  if (s.type === 'info-list') {
    return { items: lines.map((l) => { const [label, ...rest] = l.split('|'); return { label: label.trim(), value: rest.join('|').trim() }; }) };
  }
  if (s.type === 'places') {
    return { items: lines.map((l) => { const [name, ...rest] = l.split('|'); return { name: name.trim(), description: rest.join('|').trim() }; }) };
  }
  return { items: lines }; // notice
}

export const SECTION_TYPE_META = {
  notice: { label: '提醒', icon: 'triangle-alert', hint: '一行一則提醒' },
  'info-list': { label: '資訊', icon: 'list', hint: '格式：標籤 | 內容（一行一項）' },
  places: { label: '地點', icon: 'map-pin', hint: '格式：名稱 | 說明（一行一處）' },
  text: { label: '文字', icon: 'type', hint: '一行一段' },
};
