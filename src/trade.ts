import { MAX_COINS, accessoryColor, accessoryKind, itemKind, roomNpc } from './model.ts';
import type { Kit, SavedWalk, TradeState } from './model.ts';

export const KIT_NAMES: Record<Kit, string> = { shelf: '飾り棚のキット', loft: 'ロフトのキット', balcony: '継ぎ足しベランダのキット' };
export const KIT_DESCRIPTIONS: Record<Kit, string> = {
  shelf: '机に棚を継ぎ足し、壁にも飾る場所を。カップ・ランタン・絵葉書を、それぞれもう1つ飾れる。2段階まで。',
  loft: '天井裏へはしごを伸ばす。上がって休み、お茶を飲める小さな居場所。',
  balcony: '外壁に支柱と板を取り付ける。白い靄の中へ、歩ける木の足場を張り出す。',
};
export const salePrice = (source: number, accessory = false): number => accessory
  ? accessoryKind(source) === 'hat' ? 6 : 3
  : ({ cup: 4, lantern: 7, postcard: 3 })[itemKind(source)];
export const kitPrice = (kit: Kit, trade: TradeState): number => kit === 'shelf' ? 18 + 14 * (trade.shelves + trade.kits.shelf) : kit === 'loft' ? 45 : 70;
export const kitAvailable = (kit: Kit, trade: TradeState): boolean => kit === 'shelf' ? trade.shelves + trade.kits.shelf < 2 : !trade[kit] && trade.kits[kit] === 0;
export const atMerchant = (saved: SavedWalk): boolean => ['room', 'rest'].includes(saved.state.place) && roomNpc(saved.state.room, saved.realm)?.kind === 'merchant';

/** Sold records remain as tombstones, preventing a second pickup and payment. */
export function sellFind(saved: SavedWalk, source: number, accessory = false): SavedWalk | null {
  if (!atMerchant(saved)) return null;
  if (accessory) {
    const item = saved.accessories.find((item) => item.source === source);
    if (!item || item.worn || item.sold) return null;
  } else if (!saved.keepsakes.some((item) => item.source === source && item.room === null)) return null;
  const price = salePrice(source, accessory);
  if (saved.trade.coins + price > MAX_COINS) return null;
  return {
    ...saved, trade: { ...saved.trade, coins: saved.trade.coins + price },
    keepsakes: accessory ? saved.keepsakes : saved.keepsakes.map((item) => item.source === source ? { ...item, room: 'sold', lit: false } : item),
    accessories: accessory ? saved.accessories.map((item) => item.source === source ? { ...item, worn: false, sold: true } : item) : saved.accessories,
  };
}

export function duplicates(saved: SavedWalk): { source: number; accessory: boolean }[] {
  const result: { source: number; accessory: boolean }[] = [];
  const kept = new Set<string>();
  for (const item of saved.keepsakes) {
    if (item.room !== null) continue;
    const kind = itemKind(item.source);
    if (kept.has(kind)) result.push({ source: item.source, accessory: false });
    kept.add(kind);
  }
  // Preserve each color and prioritize the pieces currently being worn.
  for (const item of [...saved.accessories].sort((a, b) => Number(b.worn) - Number(a.worn))) {
    if (item.sold) continue;
    const key = `${accessoryKind(item.source)}:${accessoryColor(item.source)}`;
    if (kept.has(key) && !item.worn) result.push({ source: item.source, accessory: true });
    kept.add(key);
  }
  return result;
}

export function buyKit(saved: SavedWalk, kit: Kit): SavedWalk | null {
  if (!atMerchant(saved) || !kitAvailable(kit, saved.trade)) return null;
  const price = kitPrice(kit, saved.trade);
  if (saved.trade.coins < price) return null;
  return { ...saved, trade: { ...saved.trade, coins: saved.trade.coins - price, kits: { ...saved.trade.kits, [kit]: saved.trade.kits[kit] + 1 } } };
}

export function installKit(saved: SavedWalk, kit: Kit): SavedWalk | null {
  if (!['room', 'rest'].includes(saved.state.place) || saved.realm.home !== saved.state.room || saved.trade.kits[kit] < 1) return null;
  if (kit === 'shelf' ? saved.trade.shelves >= 2 : saved.trade[kit]) return null;
  const trade = { ...saved.trade, kits: { ...saved.trade.kits, [kit]: saved.trade.kits[kit] - 1 } };
  if (kit === 'shelf') trade.shelves++;
  else trade[kit] = true;
  return { ...saved, trade };
}
