import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { dateOf } from '@/lib/calendario';
import { formatEuro, parseEuro } from '@/lib/spesa';
import { shortTime, type Rental } from '@/lib/affitti';
import { LOGO_PROLOCO_DATA_URI } from '@/lib/logoProloco';
import { FIRMA_PRESIDENTE_DATA_URI } from '@/lib/firmaPresidente';
import { palette } from '@/theme/tokens';

export const ASSOCIATION = {
  name: 'Pro Loco Tempo Libero Vigne APS',
  taxCode: '93000500558',
  address: 'Via Flaminia Vecchia S.N.C. – Vigne di Narni, 05035 Narni (TR)',
  addressLong: 'Via Flaminia Vecchia S.N.C., Vigne di Narni, Comune di Narni (TR)',
};

export type KitchenOption = 'senza' | 'con' | null;

export type ContractData = {
  signedOn: string | null;
  firstName: string;
  lastName: string;
  birthPlace: string;
  birthDate: string | null;
  residence: string;
  taxCode: string;
  phone: string;
  email: string;
  eventType: string;
  eventDate: string | null;
  eventEndDate: string | null;
  startTime: string | null;
  endTime: string | null;
  participants: string;
  priceNoKitchen: string;
  priceKitchen: string;
  option: KitchenOption;
  agreedPrice: string;
  deposit: string;
  place: string;
  placeDate: string | null;
  referentName: string;
  referentRole: string;
  presidentSignature: boolean;
};

export const CHECK_BEFORE = [
  { key: 'pavimenti', label: 'Pavimenti e pareti' },
  { key: 'tavoli', label: 'Tavoli e sedie' },
  { key: 'cucina', label: 'Cucina e attrezzature, se autorizzata' },
  { key: 'bagni', label: 'Bagni e lavandini' },
  { key: 'porte', label: 'Porte, finestre e serrature' },
  { key: 'impianti', label: 'Impianti e apparecchiature' },
  { key: 'chiavi', label: 'Chiavi consegnate' },
  { key: 'altro', label: 'Altri beni o anomalie preesistenti' },
] as const;

export const CHECK_AFTER = [
  { key: 'pavimenti', label: 'Pavimenti e pareti' },
  { key: 'tavoli', label: 'Tavoli e sedie' },
  { key: 'cucina', label: 'Cucina e attrezzature, se utilizzata' },
  { key: 'bagni', label: 'Bagni e lavandini' },
  { key: 'porte', label: 'Porte, finestre e serrature' },
  { key: 'impianti', label: 'Impianti e apparecchiature' },
  { key: 'pulizia', label: 'Pulizia e rifiuti' },
  { key: 'chiavi', label: 'Restituzione delle chiavi' },
  { key: 'danni', label: 'Danni o anomalie riscontrati' },
] as const;

export type DepositOutcome = 'integrale' | 'parziale' | 'dopo' | null;

export type HandoverData = {
  deliveryTime: string | null;
  returnTime: string | null;
  before: Record<string, string>;
  photosBefore: boolean | null;
  notesBefore: string;
  after: Record<string, string>;
  photosAfter: boolean | null;
  notesAfter: string;
  deposit: string;
  depositOutcome: DepositOutcome;
  partialAmount: string;
  reasons: string;
  date: string | null;
  presidentSignature: boolean;
};

export type ContractRecord = {
  id: string;
  number: string;
  contract: Partial<ContractData>;
  handover: Partial<HandoverData>;
};

export const centsText = (cents: number | null | undefined) =>
  cents == null ? '' : formatEuro(cents).replace('€', '').trim();

export function contractDefaults(rental: Rental, client: Record<string, string | null> | null): ContractData {
  return {
    signedOn: null,
    firstName: client?.first_name ?? '',
    lastName: client?.last_name ?? '',
    birthPlace: client?.birth_place ?? '',
    birthDate: client?.birth_date ?? null,
    residence: client?.address ?? '',
    taxCode: client?.tax_code ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    eventType: rental.notes ?? '',
    eventDate: rental.rent_date,
    eventEndDate: rental.end_date !== rental.rent_date ? rental.end_date : null,
    startTime: rental.start_time,
    endTime: rental.end_time,
    participants: '',
    priceNoKitchen: '',
    priceKitchen: '',
    option: null,
    agreedPrice: centsText(rental.price_cents),
    deposit: '',
    place: 'Vigne di Narni',
    placeDate: null,
    referentName: '',
    referentRole: 'Presidente',
    presidentSignature: true,
  };
}

export function handoverDefaults(contract: Partial<ContractData>, rental: Rental): HandoverData {
  return {
    deliveryTime: rental.start_time,
    returnTime: rental.end_time,
    before: {},
    photosBefore: null,
    notesBefore: '',
    after: {},
    photosAfter: null,
    notesAfter: '',
    deposit: contract.deposit ?? '',
    depositOutcome: null,
    partialAmount: '',
    reasons: '',
    date: null,
    presidentSignature: true,
  };
}

export const contractKey = (rentalId?: string) => ['affitti', 'contract', rentalId] as const;

export function useContract(rentalId?: string) {
  return useQuery({
    queryKey: contractKey(rentalId),
    enabled: !!rentalId,
    queryFn: async () => {
      const { data: id, error } = await supabase.rpc('ensure_rental_contract', { p_rental_id: rentalId! });
      if (error) throw error;
      const { data, error: readError } = await supabase
        .from('rental_contracts')
        .select('id, year, seq, contract, handover')
        .eq('id', id)
        .single();
      if (readError) throw readError;
      return {
        id: data.id,
        number: `${String(data.seq).padStart(3, '0')}/${data.year}`,
        contract: (data.contract ?? {}) as Partial<ContractData>,
        handover: (data.handover ?? {}) as Partial<HandoverData>,
      } as ContractRecord;
    },
  });
}

export function useSaveContract(rentalId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      contract?: object;
      handover?: HandoverData;
      clientId?: string;
      clientPatch?: Record<string, string | null | undefined>;
    }) => {
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (v.contract) changes.contract = v.contract;
      if (v.handover) changes.handover = v.handover;
      const { error } = await supabase.from('rental_contracts').update(changes).eq('id', v.id);
      if (error) throw error;

      if (v.clientId && v.clientPatch) {
        const patch = Object.fromEntries(
          Object.entries(v.clientPatch).filter(([, value]) => value !== undefined),
        );
        if (Object.keys(patch).length) {
          const { error: clientError } = await supabase.from('clients').update(patch).eq('id', v.clientId);
          if (clientError) throw clientError;
        }
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: contractKey(rentalId) });
      queryClient.invalidateQueries({ queryKey: ['affitti'] });
    },
  });
}

export const roomClientPatch = (c: ContractData) => ({
  first_name: c.firstName.trim() || undefined,
  last_name: c.lastName.trim() || null,
  birth_place: c.birthPlace.trim() || null,
  birth_date: c.birthDate,
  address: c.residence.trim() || null,
  tax_code: c.taxCode.trim().toUpperCase() || null,
  phone: c.phone.trim() || null,
  email: c.email.trim() || null,
});

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const fill = (value: string | null | undefined, width = 40) =>
  value && value.trim()
    ? `<span class="v">${escapeHtml(value.trim())}</span>`
    : `<span class="b" style="width:${width}mm"></span>`;

export const dateText = (iso: string | null | undefined) =>
  iso ? dateOf(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export const fillDate = (iso: string | null | undefined) =>
  iso
    ? `<span class="v">${dateText(iso)}</span>`
    : '<span class="b" style="width:10mm"></span> / <span class="b" style="width:10mm"></span> / <span class="b" style="width:16mm"></span>';

export const fillMoney = (value: string, width = 24) => {
  const cents = parseEuro(value);
  return cents != null ? `<span class="v">${escapeHtml(centsText(cents))}</span>` : fill('', width);
};

export const box = (checked: boolean) =>
  `<span class="box${checked ? ' on' : ''}">${checked ? '✓' : ''}</span>`;

export const signatureBlock = (title: string, name: string, signature: boolean) => `
  <div class="sign">
    <div class="sign-title">${title}</div>
    ${name ? `<div class="sign-name">${escapeHtml(name)}</div>` : ''}
    <div class="sign-area">${signature ? `<img src="${FIRMA_PRESIDENTE_DATA_URI}" alt="Firma" />` : ''}</div>
    <div class="sign-line">Firma</div>
  </div>`;

const STYLE = `
  @page { size: A4; margin: 16mm 17mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 10.6pt; line-height: 1.5;
         color: ${palette.ink}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; align-items: center; gap: 6mm; padding-bottom: 4mm; border-bottom: 1mm solid ${palette.pine}; }
  header img { width: 46mm; }
  header .who { flex: 1; text-align: right; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.5pt;
                color: ${palette.stone}; line-height: 1.45; }
  header .who b { display: block; font-size: 10.5pt; color: ${palette.pine}; letter-spacing: .3px; }
  .stripe { height: .9mm; width: 30%; margin: 1mm 0 0 auto; background: ${palette.sun}; border-radius: 1mm; }
  h1 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15pt; line-height: 1.25; text-align: center;
       color: ${palette.pine}; letter-spacing: .5px; margin: 7mm 0 1.5mm; text-transform: uppercase; }
  .subtitle { text-align: center; font-style: italic; color: ${palette.stone}; margin: 0 0 5mm; }
  .meta { display: flex; gap: 4mm; margin-bottom: 5mm; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; }
  .meta div { flex: 1; background: ${palette.leafSoft}; border-radius: 2mm; padding: 2.5mm 3.5mm; }
  .meta span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: ${palette.stone}; }
  .meta b { font-size: 11pt; color: ${palette.pine}; }
  h3 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: ${palette.pineDeep}; margin: 4mm 0 1.5mm; break-after: avoid; }
  h2 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; text-transform: uppercase; letter-spacing: 1.6px;
       color: ${palette.pine}; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: .3mm solid #D5DDCC; break-after: avoid; }
  p { margin: 0 0 2.2mm; text-align: justify; }
  .party p { margin-bottom: 1.6mm; text-align: left; }
  .v { font-weight: 700; color: #102a1a; border-bottom: .25mm dotted ${palette.leaf}; padding: 0 .6mm; }
  .b { display: inline-block; border-bottom: .25mm solid ${palette.ink}; height: 3.6mm; vertical-align: baseline; }
  .box { display: inline-block; width: 3.4mm; height: 3.4mm; border: .3mm solid ${palette.ink}; border-radius: .6mm;
         text-align: center; line-height: 3mm; font-size: 8pt; font-family: Arial, sans-serif; margin-right: 1.2mm; vertical-align: -.4mm; }
  .box.on { background: ${palette.pine}; border-color: ${palette.pine}; color: #fff; }
  .fields p { margin-bottom: 1.4mm; }
  .fields b { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; }
  ul, ol { margin: 0 0 2.5mm; padding-left: 6mm; }
  li { margin-bottom: 1mm; }
  .article { break-inside: avoid-page; }
  .signs { display: flex; gap: 10mm; margin-top: 6mm; break-inside: avoid; }
  .sign { flex: 1; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .signs { align-items: flex-end; }
  .sign-title { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: ${palette.stone}; min-height: 7mm; display: flex; align-items: flex-end; }
  .sign-name { font-size: 10pt; font-weight: 700; margin-top: 1mm; }
  .sign-area { height: 17mm; display: flex; align-items: flex-end; justify-content: center; }
  .sign-area img { max-height: 17mm; max-width: 68mm; margin-bottom: -2mm; }
  .sign-line { border-top: .3mm solid ${palette.ink}; padding-top: 1mm; font-size: 8pt; color: ${palette.stone}; text-align: center; }
  .place { margin-top: 6mm; }
  .approval { display: flex; align-items: flex-end; gap: 3mm; margin-top: 7mm; font-family: 'Helvetica Neue', Arial, sans-serif;
              font-size: 9pt; color: ${palette.stone}; }
  .approval-line { flex: 0 0 75mm; border-bottom: .3mm solid ${palette.ink}; height: 8mm; }
  table { width: 100%; border-collapse: collapse; margin: 1mm 0 3mm; font-size: 9.8pt; }
  th { text-align: left; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase;
       letter-spacing: 1px; color: #fff; background: ${palette.pine}; padding: 2mm 3mm; }
  td { border-bottom: .3mm solid #E3E8DC; padding: 1.8mm 3mm; vertical-align: top; height: 7.6mm; }
  td:first-child { width: 42%; font-weight: 700; }
  tr { break-inside: avoid; }
  .lines .line { border-bottom: .25mm solid ${palette.ink}; height: 7mm; }
  .note { font-weight: 700; color: #102a1a; white-space: pre-wrap; border-left: .8mm solid ${palette.sun}; padding-left: 3mm; }
  .small { font-size: 9pt; color: ${palette.stone}; font-style: italic; }
  .options p { margin-bottom: 1.2mm; }
`;

export const page = (
  title: string,
  body: string,
) => `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body>
<header>
  <img src="${LOGO_PROLOCO_DATA_URI}" alt="${ASSOCIATION.name}" />
  <div class="who"><b>${ASSOCIATION.name}</b>C.F. ${ASSOCIATION.taxCode}<br/>Sede: ${ASSOCIATION.address}</div>
</header>
<div class="stripe"></div>
${body}
</body></html>`;

export const timeOrBlank = (t: string | null | undefined) =>
  t ? `<span class="v">${shortTime(t)}</span>` : fill('', 16);

function eventDates(c: ContractData) {
  if (c.eventDate && c.eventEndDate && c.eventEndDate !== c.eventDate) {
    return `dal ${fillDate(c.eventDate)} al ${fillDate(c.eventEndDate)}`;
  }
  return fillDate(c.eventDate);
}

export function contractHtml(c: ContractData, number: string) {
  const fullName = [c.firstName, c.lastName].filter((x) => x.trim()).join(' ');
  const body = `
<h1>Accordo per l’utilizzo temporaneo<br/>della sala associativa</h1>
<p class="subtitle">Con assunzione di responsabilità, deposito cauzionale e verbale di consegna e riconsegna</p>

<div class="meta">
  <div><span>N. accordo</span><b>${escapeHtml(number)}</b></div>
  <div><span>Data di sottoscrizione</span><b>${c.signedOn ? dateText(c.signedOn) : '____ / ____ / ______'}</b></div>
</div>

<h2>Tra</h2>
<div class="party">
<p><b>${ASSOCIATION.name}</b>, con sede in ${ASSOCIATION.addressLong}, C.F. ${ASSOCIATION.taxCode}, di seguito denominata “Associazione”,</p>
<p style="text-align:center;margin:3mm 0"><b>E</b></p>
<p>Il/La sottoscritto/a ${fill(fullName, 110)}</p>
<p>Nato/a a ${fill(c.birthPlace, 70)} il ${fillDate(c.birthDate)}</p>
<p>Residente in ${fill(c.residence, 120)}</p>
<p>Codice fiscale ${fill(c.taxCode.toUpperCase(), 80)}</p>
<p>Telefono ${fill(c.phone, 52)} E-mail ${fill(c.email, 60)}</p>
<p>In qualità di socio/a dell’Associazione, di seguito denominato/a “Richiedente”.</p>
<p>Le parti convengono e stipulano quanto segue.</p>
</div>

<div class="article">
<h2>Art. 1 – Oggetto dell’accordo</h2>
<p>L’Associazione autorizza il Richiedente all’utilizzo temporaneo della sala associativa sita in Vigne di Narni, Comune di Narni, esclusivamente per lo svolgimento dell’evento privato di seguito indicato, nel rispetto del presente accordo e delle condizioni applicabili alla concessione comunale dei locali.</p>
<div class="fields">
<p><b>Tipologia di evento:</b> ${fill(c.eventType, 110)}</p>
<p><b>Data dell’evento:</b> ${eventDates(c)}</p>
<p><b>Orario di utilizzo:</b> dalle ore ${timeOrBlank(c.startTime)} alle ore ${timeOrBlank(c.endTime)}</p>
<p><b>Numero indicativo di partecipanti:</b> ${fill(c.participants, 50)}</p>
</div>
<p>L’autorizzazione è personale, limitata alla data e agli orari concordati e non può essere ceduta a terzi. Non costituisce un diritto permanente all’utilizzo dei locali.</p>
<p>L’utilizzo è subordinato alla compatibilità con le condizioni della concessione comunale e con le eventuali autorizzazioni richieste.</p>
</div>

<div class="article">
<h2>Art. 2 – Corrispettivo per l’utilizzo</h2>
<p>Per l’utilizzo temporaneo della sala è previsto il seguente importo, da concordare e indicare prima della sottoscrizione:</p>
<ul>
<li><b>Utilizzo della sala senza cucina:</b> € ${fillMoney(c.priceNoKitchen)}</li>
<li><b>Utilizzo della sala con cucina:</b> € ${fillMoney(c.priceKitchen)}</li>
</ul>
<div class="options">
<p><b>Opzione scelta:</b> &nbsp;${box(c.option === 'senza')}Sala senza cucina &nbsp;&nbsp; ${box(c.option === 'con')}Sala con cucina</p>
<p><b>Importo concordato:</b> € ${fillMoney(c.agreedPrice)}</p>
</div>
<p>Il corrispettivo, ove previsto, dovrà essere versato secondo le modalità indicate dall’Associazione e documentato secondo gli obblighi applicabili.</p>
<p>L’eventuale utilizzo della cucina è consentito esclusivamente se espressamente autorizzato. Il Richiedente si impegna a utilizzare le attrezzature con diligenza, a non manomettere gli impianti e a lasciare i locali e le attrezzature puliti e in ordine.</p>
</div>

<div class="article">
<h2>Art. 3 – Deposito cauzionale</h2>
<p>Al momento della consegna delle chiavi, il Richiedente versa un deposito cauzionale di € ${fillMoney(c.deposit)}, a garanzia del rispetto degli obblighi previsti dal presente accordo.</p>
<p>Il deposito non costituisce il corrispettivo per l’utilizzo della sala.</p>
<p>Al termine dell’evento, dopo la verifica dello stato dei locali, il deposito sarà restituito al Richiedente, salvo eventuali importi giustificati per:</p>
<ul>
<li>danni a locali, arredi, attrezzature o altri beni;</li>
<li>pulizie straordinarie rese necessarie dal mancato rispetto degli obblighi concordati;</li>
<li>smarrimento o mancata restituzione delle chiavi, nei limiti dei costi effettivamente sostenuti.</li>
</ul>
<p>Le eventuali trattenute dovranno essere motivate e documentate. Se il danno o il costo supera il deposito, il Richiedente potrà essere tenuto a corrispondere la differenza, qualora ne ricorrano i presupposti di responsabilità.</p>
<p>L’eventuale restituzione parziale del deposito sarà accompagnata dall’indicazione degli importi trattenuti e delle relative motivazioni.</p>
</div>

<h2>Art. 4 – Obblighi del Richiedente</h2>
<p>Il Richiedente si impegna a:</p>
<ol>
<li>utilizzare la sala esclusivamente per l’evento dichiarato nel presente accordo;</li>
<li>rispettare gli orari concordati e riconsegnare i locali entro il termine stabilito;</li>
<li>vigilare affinché gli invitati rispettino i locali, gli arredi, le attrezzature e le regole dell’Associazione;</li>
<li>mantenere un comportamento rispettoso della quiete pubblica e delle disposizioni applicabili;</li>
<li>non superare la capienza consentita e non ostacolare uscite, passaggi e dispositivi di sicurezza;</li>
<li>non effettuare modifiche, interventi sugli impianti o spostamenti non autorizzati di arredi e attrezzature;</li>
<li>non utilizzare materiali o apparecchiature pericolosi, né svolgere attività non consentite;</li>
<li>provvedere alla raccolta dei rifiuti, alla pulizia dei locali utilizzati e al ripristino dell’ordine;</li>
<li>segnalare tempestivamente all’Associazione eventuali incidenti, guasti, rotture o danni;</li>
<li>restituire tutte le chiavi ricevute al termine dell’utilizzo.</li>
</ol>
<p>Il Richiedente non potrà concedere a sua volta la sala a terzi né utilizzare i locali per finalità diverse da quelle autorizzate.</p>

<div class="article">
<h2>Art. 5 – Responsabilità per danni</h2>
<p>Il Richiedente è responsabile, nei limiti previsti dalla legge, dei danni ai locali, agli arredi, alle attrezzature e agli altri beni dell’Associazione o presenti nella sala, quando tali danni siano a lui imputabili o derivino da comportamenti dei suoi invitati per i quali sia tenuto a rispondere.</p>
<p>Il Richiedente si impegna a comunicare immediatamente all’Associazione qualsiasi danno o anomalia riscontrata durante l’utilizzo.</p>
<p>L’eventuale responsabilità e il relativo importo saranno valutati in relazione alle circostanze, alla documentazione disponibile e ai costi effettivi di riparazione o sostituzione.</p>
<p>Il presente accordo non esclude né limita le responsabilità che la legge attribuisce all’Associazione, al Comune o ad altri soggetti, né trasferisce automaticamente al Richiedente responsabilità per fatti a lui non imputabili.</p>
</div>

<div class="article">
<h2>Art. 6 – Pulizia e riconsegna dei locali</h2>
<p>Al termine dell’evento, il Richiedente dovrà:</p>
<ul>
<li>lasciare la sala e gli eventuali locali accessori puliti e in ordine;</li>
<li>pulire le superfici e le attrezzature utilizzate, compresa la cucina, se autorizzata;</li>
<li>raccogliere e conferire correttamente i rifiuti;</li>
<li>riposizionare gli arredi secondo la disposizione concordata;</li>
<li>spegnere le apparecchiature utilizzate, chiudere porte e finestre e verificare che i locali siano lasciati in sicurezza;</li>
<li>riconsegnare le chiavi al referente dell’Associazione.</li>
</ul>
<p>La riconsegna sarà verificata, ove possibile, insieme al Richiedente mediante il verbale allegato al presente accordo.</p>
<p>Eventuali danni, anomalie o necessità di pulizia straordinaria saranno annotati nel verbale, corredati, ove opportuno, da fotografie.</p>
</div>

<div class="article">
<h2>Art. 7 – Sicurezza e rispetto delle disposizioni</h2>
<p>Il Richiedente si impegna a rispettare le disposizioni applicabili in materia di sicurezza, capienza, rumore, gestione dei rifiuti e utilizzo degli impianti.</p>
<p>È vietato utilizzare la sala in modo da arrecare pericolo alle persone o danno ai beni, nonché svolgere attività che richiedano autorizzazioni non ottenute.</p>
<p>L’Associazione può interrompere l’utilizzo qualora si verifichino violazioni gravi delle condizioni concordate o situazioni di pericolo, nel rispetto della legge e delle proprie competenze.</p>
</div>

<div class="article">
<h2>Art. 8 – Annullamento e rinuncia</h2>
<p>Il Richiedente che intenda rinunciare all’utilizzo dovrà comunicarlo all’Associazione con il maggior preavviso possibile.</p>
<p>Le parti concorderanno per iscritto l’eventuale restituzione di importi già versati, tenendo conto delle spese effettivamente sostenute, degli impegni assunti e delle disposizioni applicabili.</p>
<p>Il deposito cauzionale non potrà essere trattenuto automaticamente a titolo di penale in caso di rinuncia, in assenza dei relativi presupposti.</p>
</div>

<div class="article">
<h2>Art. 9 – Disposizioni finali</h2>
<p>Il presente accordo disciplina esclusivamente l’utilizzo temporaneo dei locali per l’evento indicato e non costituisce locazione abitativa o commerciale, né attribuisce al Richiedente un diritto continuativo o esclusivo sulla sala.</p>
<p>Le disposizioni del presente accordo si applicano nei limiti della legge e delle condizioni della concessione comunale dei locali. In caso di incompatibilità con prescrizioni vincolanti del Comune, queste ultime dovranno essere rispettate e l’utilizzo potrà essere sospeso o revocato, secondo le condizioni applicabili.</p>
<p>Il Richiedente dichiara di aver letto e compreso il presente accordo e di accettarne le condizioni.</p>
</div>

<div style="break-inside: avoid">
<p class="place"><b>Luogo e data:</b> ${fill([c.place, c.placeDate ? dateText(c.placeDate) : ''].filter(Boolean).join(', '), 100)}</p>
<div class="signs">
  ${signatureBlock('Il Richiedente', fullName, false)}
  ${signatureBlock(
    `Per la ${ASSOCIATION.name}`,
    [c.referentName, c.referentRole].filter((x) => x.trim()).join(' · '),
    c.presidentSignature,
  )}
</div>
</div>`;
  return page(`Accordo ${number}`, body);
}

const tableRows = (rows: readonly { key: string; label: string }[], values: Record<string, string>) =>
  rows
    .map((r) => {
      const v = values[r.key]?.trim();
      return `<tr><td>${escapeHtml(r.label)}</td><td>${v ? `<span class="v">${escapeHtml(v)}</span>` : ''}</td></tr>`;
    })
    .join('');

const notesBlock = (text: string, lines: number) =>
  text.trim()
    ? `<p class="note">${escapeHtml(text.trim())}</p>`
    : `<div class="lines">${'<div class="line"></div>'.repeat(lines)}</div>`;

const yesNo = (value: boolean | null) => `${box(value === true)}Sì &nbsp;&nbsp; ${box(value === false)}No`;

export function handoverHtml(h: HandoverData, c: ContractData, number: string) {
  const fullName = [c.firstName, c.lastName].filter((x) => x.trim()).join(' ');
  const referent = [c.referentName, c.referentRole].filter((x) => x.trim()).join(' · ');
  const body = `
<h1>Verbale di consegna<br/>e riconsegna della sala</h1>
<p class="subtitle">Allegato A all’accordo per l’utilizzo temporaneo della sala associativa n. ${escapeHtml(number)}, di cui costituisce parte integrante</p>

<div class="fields">
<p><b>Richiedente:</b> ${fill(fullName, 110)}</p>
<p><b>Data dell’evento:</b> ${eventDates(c)}</p>
<p><b>Consegna locali:</b> ore ${timeOrBlank(h.deliveryTime)} &nbsp;&nbsp;&nbsp; <b>Riconsegna locali:</b> ore ${timeOrBlank(h.returnTime)}</p>
</div>

<h2>A. Stato dei locali alla consegna</h2>
<table><thead><tr><th>Elemento da verificare</th><th>Stato / Annotazioni</th></tr></thead>
<tbody>${tableRows(CHECK_BEFORE, h.before)}</tbody></table>
<p><b>Fotografie iniziali:</b> &nbsp;${yesNo(h.photosBefore)}</p>
<p><b>Note:</b></p>
${notesBlock(h.notesBefore, 2)}
<div class="signs">
  ${signatureBlock('Per consegna, il referente', referent, h.presidentSignature)}
  ${signatureBlock('Il Richiedente', fullName, false)}
</div>

<h2 style="break-before: page">B. Stato dei locali alla riconsegna</h2>
<table><thead><tr><th>Elemento da verificare</th><th>Esito / Annotazioni</th></tr></thead>
<tbody>${tableRows(CHECK_AFTER, h.after)}</tbody></table>
<p><b>Fotografie finali:</b> &nbsp;${yesNo(h.photosAfter)}</p>
<p><b>Note e descrizione di eventuali danni o interventi necessari:</b></p>
${notesBlock(h.notesAfter, 3)}

<div style="break-inside: avoid">
<p style="margin-top:4mm"><b>Deposito cauzionale di € ${fillMoney(h.deposit)}:</b></p>
<div class="options">
<p>${box(h.depositOutcome === 'integrale')}Restituito integralmente</p>
<p>${box(h.depositOutcome === 'parziale')}Restituito parzialmente per € ${h.depositOutcome === 'parziale' ? fillMoney(h.partialAmount) : fill('', 24)}</p>
<p>${box(h.depositOutcome === 'dopo')}Da restituire dopo verifica/documentazione degli importi</p>
</div>
<p><b>Motivazione e importi eventualmente trattenuti:</b></p>
${notesBlock(h.reasons, 2)}
</div>

<p class="small">Il verbale documenta lo stato dei locali al momento della riconsegna. L’eventuale firma del Richiedente attesta quanto constatato e annotato, senza pregiudicare la valutazione di danni non immediatamente rilevabili.</p>

<div style="break-inside: avoid">
<div class="signs">
  ${signatureBlock('Il referente dell’Associazione', referent, h.presidentSignature)}
  ${signatureBlock('Il Richiedente', fullName, false)}
</div>
<p class="place"><b>Data:</b> ${fillDate(h.date)}</p>
</div>`;
  return page(`Verbale ${number}`, body);
}

const fileSafe = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export async function sharePdf(html: string, name: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Condivisione non disponibile su questo dispositivo');
  const { base64 } = await Print.printToFileAsync({ html, width: 595, height: 842, base64: true });
  if (!base64) throw new Error('Non sono riuscito a creare il PDF. Riprova.');
  const file = new File(Paths.cache, `${fileSafe(name)}.pdf`);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(decode(base64)));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: name,
  });
}

export const printHtml = (html: string) => Print.printAsync({ html });
