import { Share } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { formatEuro } from '@/lib/spesa';
import { palette } from '@/theme/tokens';
import { LOGO_PROLOCO_DATA_URI } from '@/lib/logoProloco';

export const POSTER_BUCKET = 'locandine';

export type EventRow = Database['public']['Tables']['events']['Row'];
export type Dish = Pick<
  Database['public']['Tables']['menu_dishes']['Row'],
  'id' | 'event_id' | 'section' | 'name' | 'description' | 'price_cents' | 'position'
> & {
  ingredients?: number;
};

export type PriceMode = Database['public']['Enums']['menu_price_mode'];

export const SECTIONS = [
  { value: 'antipasti', label: 'Antipasti' },
  { value: 'primi', label: 'Primi' },
  { value: 'secondi', label: 'Secondi' },
  { value: 'contorni', label: 'Contorni' },
  { value: 'dolci', label: 'Dolci' },
] as const;

export type Section = (typeof SECTIONS)[number]['value'];

export const sectionLabel = (s: string) => SECTIONS.find((x) => x.value === s)?.label ?? s;

export const menuKeys = {
  all: ['menu'] as const,
  list: (orgId?: string) => ['menu', 'list', orgId] as const,
  detail: (id?: string) => ['menu', 'detail', id] as const,
};

export function localIsoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const isoToIt = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function itToIso(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getDate() !== Number(d) || date.getMonth() !== Number(mo) - 1) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function parseTime(text: string): string | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

export const shortTime = (t?: string | null) => (t ? t.slice(0, 5) : '');

export function formatEventDate(iso: string, time?: string | null) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return time ? `${day} · ore ${shortTime(time)}` : day;
}

export function nextWeekday(dow: number) {
  const d = new Date();
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7));
  return localIsoDate(d);
}

export const posterUrl = (path?: string | null) =>
  path ? supabase.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl : null;

export async function pickPoster() {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  return result.assets[0];
}

export async function uploadPoster(
  orgId: string,
  eventId: string,
  asset: { uri: string; width: number },
) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > 1600) context.resize({ width: 1600 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });

  const path = `${orgId}/${eventId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, decode(saved.base64!), { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

async function removePosters(orgId: string, eventId: string) {
  const folder = `${orgId}/${eventId}`;
  const { data } = await supabase.storage.from(POSTER_BUCKET).list(folder);
  if (data?.length) {
    await supabase.storage.from(POSTER_BUCKET).remove(data.map((f) => `${folder}/${f.name}`));
  }
}

export function useEvents(orgId?: string) {
  return useQuery({
    queryKey: menuKeys.list(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, name, starts_on, start_time, place, poster_path, price_mode, fixed_price_cents, menu_dishes(count)',
        )
        .eq('org_id', orgId!)
        .order('starts_on', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.map((e) => ({
        ...e,
        dishes: (e.menu_dishes as unknown as { count: number }[])[0]?.count ?? 0,
      }));
    },
  });
}

export function useEvent(id?: string) {
  return useQuery({
    queryKey: menuKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, org_id, name, starts_on, start_time, place, notes, poster_path, created_by, price_mode, fixed_price_cents, fixed_price_note, menu_dishes(id, event_id, section, name, description, price_cents, position, dish_ingredients(count))',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const order = SECTIONS.map((s) => s.value as string);
      type RawDish = Dish & { dish_ingredients: { count: number }[] };
      const dishes = (data.menu_dishes as unknown as RawDish[])
        .map(({ dish_ingredients, ...d }) => ({ ...d, ingredients: dish_ingredients[0]?.count ?? 0 }))
        .sort(
        (a, b) =>
          order.indexOf(a.section) - order.indexOf(b.section) ||
          a.position - b.position ||
          a.name.localeCompare(b.name, 'it'),
      );
      return { ...data, dishes };
    },
  });
}

function useInvalidateMenu() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: menuKeys.all });
}

export function useCreateEvent(orgId?: string) {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async (v: {
      name: string;
      startsOn: string;
      startTime: string | null;
      place: string;
      copyFrom?: string | null;
      poster?: { uri: string; width: number } | null;
      priceMode: PriceMode;
      fixedPriceCents: number | null;
      fixedPriceNote: string | null;
    }) => {
      const { data: id, error } = await supabase.rpc('create_event', {
        p_org_id: orgId!,
        p_name: v.name,
        p_starts_on: v.startsOn,
        p_start_time: v.startTime ?? undefined,
        p_place: v.place,
        p_copy_from: v.copyFrom ?? undefined,
      });
      if (error) throw error;
      const poster_path = v.poster ? await uploadPoster(orgId!, id, v.poster) : null;
      const { error: e2 } = await supabase
        .from('events')
        .update({
          price_mode: v.priceMode,
          fixed_price_cents: v.priceMode === 'fisso' ? v.fixedPriceCents : null,
          fixed_price_note: v.priceMode === 'fisso' ? v.fixedPriceNote?.trim() || null : null,
          ...(poster_path ? { poster_path } : {}),
        })
        .eq('id', id);
      if (e2) throw e2;
      return id as string;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useUpdateEvent(eventId?: string) {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async (v: {
      name?: string;
      starts_on?: string;
      start_time?: string | null;
      place?: string | null;
      notes?: string | null;
      poster_path?: string | null;
      price_mode?: PriceMode;
      fixed_price_cents?: number | null;
      fixed_price_note?: string | null;
    }) => {
      const { error } = await supabase.from('events').update(v).eq('id', eventId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetPoster(orgId?: string, eventId?: string) {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async (v: { asset: { uri: string; width: number } | null; oldPath?: string | null }) => {
      const path = v.asset ? await uploadPoster(orgId!, eventId!, v.asset) : null;
      const { error } = await supabase.from('events').update({ poster_path: path }).eq('id', eventId!);
      if (error) throw error;
      if (v.oldPath) await supabase.storage.from(POSTER_BUCKET).remove([v.oldPath]);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useDeleteEvent(orgId?: string, eventId?: string) {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async () => {
      const { error, count } = await supabase
        .from('events')
        .delete({ count: 'exact' })
        .eq('id', eventId!);
      if (error) throw error;
      if (count === 0) {
        throw new Error('Può eliminarlo chi l’ha creato o un amministratore.');
      }
      await removePosters(orgId!, eventId!);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useSaveDish(eventId?: string, orgId?: string) {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      section: Section;
      name: string;
      description: string | null;
      price_cents: number | null;
      position?: number;
    }) => {
      if (v.id) {
        const { error } = await supabase
          .from('menu_dishes')
          .update({
            section: v.section,
            name: v.name,
            description: v.description,
            price_cents: v.price_cents,
          })
          .eq('id', v.id);
        if (error) throw error;
        return v.id;
      }
      const { data, error } = await supabase
        .from('menu_dishes')
        .insert({
          event_id: eventId!,
          org_id: orgId!,
          section: v.section,
          name: v.name,
          description: v.description,
          price_cents: v.price_cents,
          position: v.position ?? 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      invalidate();
    },
  });
}

export function useDeleteDish() {
  const invalidate = useInvalidateMenu();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_dish', { p_dish_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['spesa'] });
    },
  });
}

export function useEventList(eventId?: string) {
  return useQuery({
    queryKey: ['spesa', 'event-list', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_summary')
        .select('*')
        .eq('event_id', eventId!)
        .order('status')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export async function ensureEventList(eventId: string) {
  const { data, error } = await supabase.rpc('ensure_event_list', { p_event_id: eventId });
  if (error) throw error;
  return data as string;
}

export type DishIngredient = {
  id: string;
  qty: number;
  list_item_id: string;
  shopping_list_items: {
    id: string;
    list_id: string;
    name: string;
    qty: number;
    unit: string;
    note: string | null;
    checked: boolean;
    item_id: string | null;
    items: { location: string } | null;
    dish_ingredients: { count: number }[];
  } | null;
};

export function useDishIngredients(dishId?: string) {
  return useQuery({
    queryKey: ['spesa', 'dish', dishId],
    enabled: !!dishId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dish_ingredients')
        .select(
          'id, qty, list_item_id, shopping_list_items(id, list_id, name, qty, unit, note, checked, item_id, items(location), dish_ingredients(count))',
        )
        .eq('dish_id', dishId!);
      if (error) throw error;
      return (data as unknown as DishIngredient[]).sort((a, b) =>
        (a.shopping_list_items?.name ?? '').localeCompare(b.shopping_list_items?.name ?? '', 'it'),
      );
    },
  });
}

export function useSetDishIngredientQty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const { error } = await supabase.rpc('set_dish_ingredient_qty', { p_id: id, p_qty: qty });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      queryClient.invalidateQueries({ queryKey: ['spesa'] });
      queryClient.invalidateQueries({ queryKey: menuKeys.all });
    },
  });
}

type MenuForOutput = {
  name: string;
  starts_on: string;
  start_time: string | null;
  place: string | null;
  poster_path: string | null;
  price_mode: PriceMode;
  fixed_price_cents: number | null;
  fixed_price_note: string | null;
  dishes: Dish[];
};

export function fixedPriceLine(m: {
  price_mode: PriceMode;
  fixed_price_cents: number | null;
  fixed_price_note?: string | null;
}) {
  if (m.price_mode !== 'fisso') return null;
  const price = m.fixed_price_cents != null ? `${formatEuro(m.fixed_price_cents)} a persona` : 'prezzo da definire';
  return [`Menù fisso ${price}`, m.fixed_price_note].filter(Boolean).join(' · ');
}

const dishPrice = (m: MenuForOutput, d: Dish) =>
  m.price_mode !== 'fisso' && d.price_cents != null ? formatEuro(d.price_cents) : '';

const grouped = (dishes: Dish[]) =>
  SECTIONS.map((s) => ({ ...s, dishes: dishes.filter((d) => d.section === s.value) })).filter(
    (g) => g.dishes.length > 0,
  );

export function menuText(m: MenuForOutput) {
  const lines = [
    m.name.toUpperCase(),
    [formatEventDate(m.starts_on, m.start_time), m.place].filter(Boolean).join(' · '),
  ];
  const fixed = fixedPriceLine(m);
  if (fixed) lines.push(fixed);
  lines.push('');
  grouped(m.dishes).forEach((g) => {
    lines.push(`— ${g.label.toUpperCase()} —`);
    g.dishes.forEach((d) => {
      const price = dishPrice(m, d);
      lines.push(`${d.name}${price ? `  ${price}` : ''}`);
      if (d.description) lines.push(`   ${d.description}`);
    });
    lines.push('');
  });
  const url = posterUrl(m.poster_path);
  if (url) lines.push(`Locandina: ${url}`);
  return lines.join('\n').trim();
}

export async function shareMenu(m: MenuForOutput) {
  await Share.share({ message: menuText(m), title: m.name });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BRAND = {
  dark: palette.pine,
  green: palette.leaf,
  sun: palette.sun,
  ink: palette.ink,
  muted: palette.stone,
  paper: palette.cream,
};

type Density = 'ampio' | 'medio' | 'compatto' | 'colonne' | 'lungo';

const ONE_COLUMN = {
  ampio:    { base: 496, section: 42.5, dish: 34.1, descLine: 18.3, fixed: 178.5, descChars: 95,  titleChars: 28, titleLine: 47 },
  medio:    { base: 455, section: 34.9, dish: 28.3, descLine: 18.3, fixed: 152,   descChars: 102, titleChars: 33, titleLine: 40 },
  compatto: { base: 421, section: 29.6, dish: 23.7, descLine: 17.3, fixed: 133.1, descChars: 110, titleChars: 38, titleLine: 35 },
} as const;

const TWO_COLUMNS = {
  head: 288, fixed: 133, foot: 128, titleChars: 38, titleLine: 35,
  bodyBase: 2.4, section: 12.2, dish: 14.5, descLine: 9.6, descChars: 52, slack: 30,
} as const;

const PAGE_PX = (295 * 96) / 25.4 - 30;

const linesOf = (dishes: Dish[], chars: number) =>
  dishes.reduce((sum, d) => sum + (d.description ? Math.ceil(d.description.length / chars) : 0), 0);

function chooseDensity(m: MenuForOutput): Density {
  const groups = grouped(m.dishes).length;
  const isFixed = m.price_mode === 'fisso';

  for (const density of ['ampio', 'medio', 'compatto'] as const) {
    const k = ONE_COLUMN[density];
    const titleLines = Math.max(1, Math.ceil(m.name.length / k.titleChars));
    const height =
      k.base +
      groups * k.section +
      m.dishes.length * k.dish +
      linesOf(m.dishes, k.descChars) * k.descLine +
      (isFixed ? k.fixed : 0) +
      (titleLines - 1) * k.titleLine;
    if (height <= PAGE_PX) return density;
  }

  const c = TWO_COLUMNS;
  const titleLines = Math.max(1, Math.ceil(m.name.length / c.titleChars));
  const height =
    c.head +
    (isFixed ? c.fixed : 0) +
    (titleLines - 1) * c.titleLine +
    c.bodyBase +
    groups * c.section +
    m.dishes.length * c.dish +
    linesOf(m.dishes, c.descChars) * c.descLine +
    c.slack +
    c.foot;
  return height <= PAGE_PX ? 'colonne' : 'lungo';
}

const SIZES: Record<
  Density,
  { logo: string; title: number; dish: number; desc: number; sectionGap: number; dishGap: number; badge: number; gap: number }
> = {
  ampio:    { logo: '58%', title: 34, dish: 14.5, desc: 10.5, sectionGap: 7,   dishGap: 3.2, badge: 34, gap: 5 },
  medio:    { logo: '48%', title: 29, dish: 13,   desc: 9.8,  sectionGap: 5,   dishGap: 2.2, badge: 28, gap: 4 },
  compatto: { logo: '40%', title: 25, dish: 12,   desc: 9.2,  sectionGap: 3.6, dishGap: 1.5, badge: 24, gap: 3 },
  colonne:  { logo: '40%', title: 25, dish: 11.5, desc: 9,    sectionGap: 4,   dishGap: 1.6, badge: 24, gap: 3 },
  lungo:    { logo: '36%', title: 24, dish: 11.5, desc: 9,    sectionGap: 4.5, dishGap: 1.6, badge: 22, gap: 3 },
};

export function menuHtml(m: MenuForOutput) {
  const density = chooseDensity(m);
  const multi = density === 'lungo';
  const cols = density === 'colonne' || density === 'lungo';
  const z = SIZES[density];
  const fixed = m.price_mode === 'fisso';
  const when = [formatEventDate(m.starts_on, m.start_time), m.place].filter(Boolean).join(' · ');
  const stripes = '<div class="stripes"><span></span><span></span><span></span></div>';
  const closing = '<p>Pro Loco Tempo Libero Vigne · Buon appetito!</p>';

  const sections = grouped(m.dishes)
    .map(
      (g, i, all) => `
      <section>
        <h2><span>${escapeHtml(g.label)}</span></h2>
        ${g.dishes
          .map((d) => {
            const price = dishPrice(m, d);
            const desc = d.description ? `<div class="desc">${escapeHtml(d.description)}</div>` : '';
            return price
              ? `<div class="dish"><div class="line"><span class="name">${escapeHtml(d.name)}</span><span class="dots"></span><span class="price">${escapeHtml(price)}</span></div>${desc}</div>`
              : `<div class="dish center"><div class="name">${escapeHtml(d.name)}</div>${desc}</div>`;
          })
          .join('')}
        ${multi && i === all.length - 1 ? `<div class="closing">${stripes}${closing}</div>` : ''}
      </section>`,
    )
    .join('');

  const priceBadge =
    fixed && m.fixed_price_cents != null
      ? `<div class="badge">
           <div class="badge-price">${escapeHtml(formatEuro(m.fixed_price_cents).replace(',00', ''))}</div>
           <div class="badge-label">a persona</div>
         </div>
         ${m.fixed_price_note ? `<div class="badge-note">${escapeHtml(m.fixed_price_note)}</div>` : ''}`
      : '';

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,800;1,500&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    ${multi ? '@page { size: A4; margin: 14mm 0 16mm; }' : '@page { size: A4; margin: 0; }'}
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: ${BRAND.paper}; }
    body { font-family: 'Manrope', 'Helvetica Neue', Arial, sans-serif; color: ${BRAND.ink};
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .page { position: relative; display: flex; flex-direction: column;
            padding: ${multi ? '0 18mm' : '15mm 20mm 0'}; ${multi ? '' : 'height: 295mm; overflow: hidden;'} }
    .page > * { flex-shrink: 0; }
    .page > .body { flex: ${multi ? '0 0 auto' : '1 1 auto'}; min-height: 0; display: flex; flex-direction: column;
                    justify-content: ${multi ? 'flex-start' : 'center'}; }
    .frame { position: absolute; inset: 7mm; border: 2px solid ${BRAND.dark}; border-radius: 5mm; pointer-events: none; }
    .frame::after { content: ''; position: absolute; inset: 2.2mm; border: 0.8px solid ${BRAND.green}; border-radius: 3.5mm; }

    .logo { display: block; width: ${z.logo}; margin: 2mm auto 0; }
    .stripes { display: flex; flex-direction: column; align-items: center; gap: 1.5mm; margin: ${z.gap}mm 0; }
    .stripes span { display: block; height: 1.2mm; border-radius: 1mm; background: ${BRAND.green}; }
    .stripes span:nth-child(1) { width: 34%; background: ${BRAND.dark}; }
    .stripes span:nth-child(2) { width: 24%; }
    .stripes span:nth-child(3) { width: 14%; background: ${BRAND.sun}; }

    .kicker { text-align: center; text-transform: uppercase; letter-spacing: 4px; font-size: 9pt;
              font-weight: 800; color: ${BRAND.green}; margin-bottom: 1.5mm; }
    h1 { font-family: 'Playfair Display', Georgia, serif; font-weight: 800; font-size: ${z.title}pt; line-height: 1.05;
         color: ${BRAND.dark}; text-align: center; margin: 0; }
    .when { text-align: center; text-transform: uppercase; letter-spacing: 2.5px; font-size: 9pt;
            font-weight: 700; color: ${BRAND.muted}; margin-top: 2.5mm; }

    .badge { width: ${z.badge}mm; height: ${z.badge}mm; border-radius: 50%; background: ${BRAND.sun}; margin: ${z.gap + 1}mm auto 0;
             display: flex; flex-direction: column; align-items: center; justify-content: center;
             box-shadow: 0 0 0 1.8mm ${BRAND.paper}, 0 0 0 2.4mm ${BRAND.sun}; }
    .badge-price { font-family: 'Playfair Display', Georgia, serif; font-weight: 800; font-size: ${Math.round(z.badge * 0.72)}pt;
                   color: ${BRAND.dark}; line-height: 1; }
    .badge-label { font-size: 7.5pt; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: ${BRAND.dark}; margin-top: 1mm; }
    .badge-note { text-align: center; font-style: italic; font-family: 'Playfair Display', Georgia, serif;
                  font-size: 10.5pt; color: ${BRAND.muted}; margin-top: 3mm; }

    main { margin-top: 2mm; ${cols ? 'column-count: 2; column-gap: 12mm; column-fill: balance;' : ''} }
    section { break-inside: avoid; page-break-inside: avoid; margin-top: ${z.sectionGap}mm; }
    h2 { display: flex; align-items: center; gap: 4mm; margin: 0 0 ${Math.max(1.5, z.dishGap)}mm; break-after: avoid; }
    h2::before, h2::after { content: ''; flex: 1; height: 0.6mm; border-radius: 1mm; background: ${BRAND.green}; opacity: .55; }
    h2 span { font-size: 10.5pt; font-weight: 800; letter-spacing: 5px; text-transform: uppercase; color: ${BRAND.dark}; padding: 0 1mm; }
    h2 span::before { content: '\\2600'; color: ${BRAND.sun}; margin-right: 2.5mm; letter-spacing: 0; }

    .dish { margin: ${z.dishGap}mm ${cols ? '0' : '6mm'}; break-inside: avoid; }
    .dish.center { text-align: center; }
    .name { font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: ${z.dish}pt; }
    .line { display: flex; align-items: baseline; gap: 2mm; }
    .dots { flex: 1; border-bottom: 1.4px dotted ${BRAND.green}; transform: translateY(-1.2mm); }
    .price { font-weight: 800; font-size: ${z.dish - 2}pt; color: ${BRAND.dark}; white-space: nowrap; }
    .desc { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: ${z.desc}pt;
            color: ${BRAND.muted}; margin-top: 0.6mm; }

    footer { padding: 6mm 0 15mm; text-align: center; }
    footer .stripes, .closing .stripes { margin: 0 0 3mm; }
    footer p, .closing p { margin: 0; font-size: 8pt; letter-spacing: 3px; text-transform: uppercase;
                           font-weight: 800; color: ${BRAND.dark}; }
    .closing { margin-top: 8mm; text-align: center; break-inside: avoid; }
  </style></head>
  <body>
    ${multi ? '' : '<div class="frame"></div>'}
    <div class="page">
      <img class="logo" src="${LOGO_PROLOCO_DATA_URI}" alt="Pro Loco Tempo Libero Vigne" />
      ${stripes}
      <div class="kicker">Menù</div>
      <h1>${escapeHtml(m.name)}</h1>
      <div class="when">${escapeHtml(when)}</div>
      ${priceBadge}
      <div class="body"><main>${sections || `<p style="text-align:center;color:${BRAND.muted}">Menù in preparazione</p>`}</main></div>
      ${multi ? '' : `<footer>${stripes}${closing}</footer>`}
    </div>
  </body></html>`;
}

export async function printMenu(m: MenuForOutput) {
  await Print.printAsync({ html: menuHtml(m), width: 595, height: 842 });
}
