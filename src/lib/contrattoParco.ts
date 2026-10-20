import { parseEuro } from '@/lib/spesa';
import type { Rental } from '@/lib/affitti';
import {
  box,
  centsText,
  dateText,
  escapeHtml,
  fill,
  fillDate,
  fillMoney,
  page,
  signatureBlock,
  timeOrBlank,
} from '@/lib/contratto';
import { euroInWords } from '@/lib/euroInLettere';

export const PARK_GRANTOR = {
  name: 'Associazione Pro Loco Tempo Libero Vigne',
  seat: 'via Flaminia s.n.c.',
  vat: '0705630556',
  taxCode: '93000500558',
};

export type Usage = 'no' | 'si' | null;

export const ATTACHMENTS = [
  { key: 'programma', label: 'descrizione dell’evento e programma' },
  { key: 'elettrico', label: 'scheda utilizzi elettrici' },
  { key: 'acqua', label: 'accordo per utilizzo acqua' },
  { key: 'planimetria', label: 'planimetria dell’area' },
  { key: 'polizza', label: 'polizza assicurativa' },
] as const;

export type ParkContractData = {
  kind: 'parco';
  holderName: string;
  holderSeat: string;
  holderTaxCode: string;
  representative: string;
  representativeRole: string;
  area: string;
  activity: string;
  description: string;
  fromDate: string | null;
  fromTime: string | null;
  toDate: string | null;
  toTime: string | null;
  extraTimes: string;
  price: string;
  priceInWords: string;
  paymentTerms: string;
  deposit: string;
  depositTerms: string;
  toilets: string;
  water: Usage;
  waterConditions: string;
  waterCosts: string;
  electricNeeds: string;
  electric: Usage;
  electricConditions: string;
  insurance: string;
  cancellation: string;
  attachments: Record<string, boolean>;
  otherAttachments: string;
  place: string;
  signedOn: string | null;
  grantorName: string;
  presidentSignature: boolean;
};

const centsOf = (value: string) => parseEuro(value);

export function parkDefaults(rental: Rental, client: Record<string, string | null> | null): ParkContractData {
  const name = [client?.first_name, client?.last_name].filter(Boolean).join(' ');
  return {
    kind: 'parco',
    holderName: name,
    holderSeat: client?.address ?? '',
    holderTaxCode: client?.tax_code ?? '',
    representative: name,
    representativeRole: '',
    area: '',
    activity: rental.notes ?? '',
    description: '',
    fromDate: rental.rent_date,
    fromTime: rental.start_time,
    toDate: rental.end_date,
    toTime: rental.end_time,
    extraTimes: '',
    price: centsText(rental.price_cents),
    priceInWords: rental.price_cents != null ? euroInWords(rental.price_cents) : '',
    paymentTerms: '',
    deposit: '',
    depositTerms: '',
    toilets: '',
    water: null,
    waterConditions: '',
    waterCosts: '',
    electricNeeds: '',
    electric: null,
    electricConditions: '',
    insurance: '',
    cancellation: '',
    attachments: {},
    otherAttachments: '',
    place: 'Vigne di Narni',
    signedOn: null,
    grantorName: '',
    presidentSignature: true,
  };
}

export const wordsFor = (price: string) => {
  const cents = centsOf(price);
  return cents != null ? euroInWords(cents) : '';
};

const usage = (value: Usage, conditions: string, authorizedText: string) =>
  `${box(value === 'no')}NON richiesto &nbsp;&nbsp; ${box(value === 'si')}${authorizedText}: ${
    value === 'si' ? fill(conditions, 90) : fill('', 90)
  }`;

const textBlock = (value: string, width = 150) =>
  value.trim() ? `<span class="v">${escapeHtml(value.trim())}</span>` : fill('', width);

export function parkContractHtml(c: ParkContractData, number: string) {
  const attachments = ATTACHMENTS.map((a) => `${box(!!c.attachments[a.key])}${a.label}`).join('; ');
  const other = c.otherAttachments.trim();
  const priceCents = centsOf(c.price);

  const body = `
<h1>Contratto di concessione d’uso<br/>temporaneo di area</h1>
<p class="subtitle">E disciplina dell’utilizzo delle utenze e delle responsabilità · Parco Cramaccioli</p>

<div class="meta">
  <div><span>N. contratto</span><b>${escapeHtml(number)}</b></div>
  <div><span>Data</span><b>${c.signedOn ? dateText(c.signedOn) : '____ / ____ / ______'}</b></div>
</div>

<h2>Tra</h2>
<div class="party">
<p>L’<b>${PARK_GRANTOR.name}</b>, con sede legale in ${PARK_GRANTOR.seat}, P. IVA ${PARK_GRANTOR.vat} e C.F. ${PARK_GRANTOR.taxCode}, in persona del Presidente pro tempore, di seguito denominata “Concedente”;</p>
<p style="text-align:center;margin:3mm 0"><b>e</b></p>
<p>Il/La Sig./Società ${fill(c.holderName, 100)}, con sede/residenza in ${fill(c.holderSeat, 100)}, C.F./P. IVA ${fill(c.holderTaxCode.toUpperCase(), 60)}, in persona di ${fill(c.representative, 80)}, in qualità di ${fill(c.representativeRole, 60)}, di seguito denominato/a “Concessionario”.</p>
</div>

<h2>Premesse</h2>
<p>Le premesse costituiscono parte integrante del presente accordo. Il Concessionario dichiara di aver preso visione dell’area richiesta e di conoscere le condizioni e le regole previste dal presente contratto.</p>

<div class="article">
<h2>Art. 1 – Oggetto e destinazione d’uso</h2>
<p>Il Concedente concede al Concessionario l’uso temporaneo della porzione di area del Parco Cramaccioli individuata come segue: ${textBlock(c.area)} (di seguito “Area Concessa”), esclusivamente per lo svolgimento della seguente attività/evento: ${textBlock(c.activity)}.</p>
<p>Descrizione dettagliata dell’attività, delle attrezzature e dei servizi previsti: ${textBlock(c.description)}.</p>
<p>L’utilizzo è consentito unicamente per la finalità sopra descritta. È vietato svolgere attività diverse, ulteriori o incompatibili con quelle concordate senza preventiva autorizzazione scritta del Concedente. Restano in ogni caso vietate le attività illecite, pericolose, incompatibili con la destinazione dell’area o svolte in violazione delle norme applicabili, comprese quelle in materia di sicurezza, rumore, pubblico spettacolo e somministrazione, ove pertinenti.</p>
<p>La concessione riguarda esclusivamente l’area espressamente individuata e i servizi eventualmente autorizzati per iscritto. Non sono compresi altri spazi, dotazioni o servizi non indicati nel presente contratto o in un allegato sottoscritto dalle parti.</p>
</div>

<div class="article">
<h2>Art. 2 – Durata e corrispettivo</h2>
<div class="fields">
<p><b>Periodo di concessione:</b> dal ${fillDate(c.fromDate)} alle ore ${timeOrBlank(c.fromTime)} al ${fillDate(c.toDate)} alle ore ${timeOrBlank(c.toTime)}.</p>
</div>
<p>Eventuali giorni e orari aggiuntivi, comprese le operazioni di allestimento e disallestimento, devono essere indicati e autorizzati per iscritto: ${textBlock(c.extraTimes)}.</p>
<div class="fields">
<p><b>Corrispettivo complessivo per la concessione:</b> € ${fillMoney(c.price, 30)} (in lettere: ${fill(c.priceInWords || (priceCents != null ? euroInWords(priceCents) : ''), 80)}).</p>
<p><b>Modalità e scadenza del pagamento:</b> ${textBlock(c.paymentTerms, 110)}.</p>
<p><b>Deposito cauzionale, se previsto:</b> € ${fillMoney(c.deposit, 30)}, con modalità e condizioni di restituzione: ${textBlock(c.depositTerms, 90)}.</p>
</div>
<p>Ogni variazione di date, orari, durata o corrispettivo deve essere concordata per iscritto tra le parti. In assenza di accordo scritto, restano validi i dati riportati nel presente contratto.</p>
</div>

<h2>Art. 3 – Stato dei luoghi, utenze e limitazioni tecniche</h2>
<p>Il Concessionario dichiara di aver visionato l’Area Concessa, di averne verificato le condizioni apparenti e di accettarla nello stato in cui si trova, fatto salvo quanto espressamente indicato nel presente contratto. Eventuali criticità riscontrate prima della consegna dovranno essere comunicate al Concedente.</p>

<div class="article">
<h3>3.1 – Servizi igienici</h3>
<p>Disponibilità e condizioni d’uso dei servizi igienici: ${textBlock(c.toilets)}.</p>
<p>Salvo diversa autorizzazione scritta, i servizi igienici esistenti non possono essere utilizzati. Ove necessario, il Concessionario provvede a proprie spese all’installazione e alla gestione di servizi igienici temporanei conformi alle disposizioni applicabili.</p>
</div>

<div class="article">
<h3>3.2 – Acqua e utenza idrica</h3>
<p>La disponibilità di un punto di fornitura idrica non comporta automaticamente l’autorizzazione al suo utilizzo. Il Concessionario deve indicare prima della sottoscrizione, o comunque prima dell’evento, se richiede l’utilizzo dell’acqua e per quali esigenze.</p>
<div class="options"><p><b>Utilizzo dell’acqua:</b> ${usage(c.water, c.waterConditions, 'richiesto e autorizzato alle seguenti condizioni')}.</p></div>
<p>L’utilizzo dell’utenza idrica è consentito esclusivamente nei limiti e con le modalità concordati per iscritto. È vietato realizzare allacci, modifiche, derivazioni o interventi non autorizzati. Eventuali consumi, costi o modalità di contabilizzazione: ${textBlock(c.waterCosts, 100)}.</p>
</div>

<h3>3.3 – Impianto elettrico</h3>
<p>Il Concedente dichiara che l’impianto elettrico presente nell’area è dotato delle certificazioni disponibili ed è stato dichiarato a norma secondo la documentazione in possesso del Concedente. La documentazione pertinente potrà essere visionata secondo modalità concordate.</p>
<p>Prima dell’utilizzo, il Concessionario è tenuto a descrivere in modo completo e veritiero le necessità elettriche dell’evento, indicando almeno: apparecchiature e attrezzature da collegare, potenza richiesta, numero e posizione dei punti di alimentazione, eventuali quadri o prolunghe, illuminazione, impianti audio, refrigerazione, cucina o altre utenze. La descrizione, allegata al presente contratto, costituisce parte integrante dell’accordo.</p>
<p>Esigenze e utilizzi elettrici dichiarati dal Concessionario: ${textBlock(c.electricNeeds)}.</p>
<div class="options"><p><b>Utilizzo dell’impianto elettrico:</b> ${usage(c.electric, c.electricConditions, 'richiesto e autorizzato nei limiti descritti sopra e secondo le seguenti condizioni')}.</p></div>
<p>L’utilizzo dell’impianto è consentito soltanto dopo il preventivo accordo scritto con il Concedente e deve rimanere rigorosamente entro gli utilizzi, i carichi, le apparecchiature e le modalità concordati. È vietato collegare dispositivi o carichi ulteriori, modificare collegamenti, aprire quadri, manomettere componenti, effettuare riparazioni o modifiche, oppure consentire interventi da parte di soggetti non autorizzati.</p>
<p>Qualsiasi variazione delle esigenze dichiarate deve essere comunicata e autorizzata per iscritto prima di essere attuata. Il Concedente può negare o sospendere l’utilizzo in caso di informazioni incomplete, utilizzi non concordati, dubbi sulla sicurezza o violazioni delle condizioni stabilite.</p>
<p>Il Concessionario è responsabile delle proprie apparecchiature, dei collegamenti da lui effettuati o fatti effettuare, dell’osservanza delle istruzioni ricevute e delle attività dei propri incaricati, dipendenti, fornitori e partecipanti. Eventuali impianti o attrezzature temporanei aggiuntivi dovranno essere idonei, installati da personale qualificato ove richiesto e corredati della documentazione prevista dalla normativa applicabile.</p>

<h2>Art. 4 – Obblighi, responsabilità e assicurazione</h2>
<p>Il Concessionario organizza e gestisce l’attività sotto la propria responsabilità e si impegna a ottenere, ove necessari, autorizzazioni, licenze, permessi e certificazioni relativi all’evento e alle attività svolte. È responsabile del rispetto delle norme applicabili e della sicurezza delle attrezzature e delle operazioni di propria competenza.</p>
<p>Il Concessionario si impegna a stipulare e mantenere valida per tutta la durata dell’attività una polizza di responsabilità civile verso terzi (RCT), adeguata alla natura dell’evento e ai rischi connessi, e a consegnarne copia al Concedente prima dell’inizio dell’utilizzo. Massimale e ulteriori requisiti, se concordati: ${textBlock(c.insurance, 100)}.</p>
<p>Il Concessionario risponde dei danni causati al parco, all’Area Concessa, agli impianti, alle attrezzature e a terzi quando riconducibili alle proprie attività, omissioni, attrezzature, installazioni, utilizzi non autorizzati o condotte dei soggetti di cui si avvale.</p>
<p>In particolare, il Concessionario si assume la responsabilità per manomissioni, collegamenti, modifiche, sovraccarichi o usi dell’impianto elettrico e dell’utenza idrica diversi da quelli preventivamente concordati e autorizzati, nonché per ogni utilizzo dell’area difforme dalla destinazione indicata nel presente contratto.</p>
<p>Nei limiti consentiti dalla legge, il Concessionario si impegna a tenere indenne e manlevare il Concedente e il Presidente pro tempore da richieste, danni, costi e spese, comprese le spese legali ragionevoli, derivanti da fatti imputabili al Concessionario o ai soggetti di cui si avvale. La presente clausola non esclude né limita responsabilità inderogabili previste dalla legge a carico del Concedente o del Presidente.</p>
<p>Il Concedente non assume compiti di organizzazione, gestione o vigilanza dell’evento per conto del Concessionario. Restano fermi gli obblighi e le responsabilità che non possono essere esclusi per legge.</p>

<div class="article">
<h2>Art. 5 – Controlli, sospensione e risoluzione</h2>
<p>Il Concedente può accedere all’Area Concessa, con modalità compatibili con la sicurezza e lo svolgimento dell’attività, per verificare il rispetto del presente contratto.</p>
<p>In caso di violazione delle condizioni concordate, di utilizzo non autorizzato delle utenze, di manomissioni, di pericolo per persone o cose o di inosservanza delle disposizioni applicabili, il Concedente può chiedere l’immediata cessazione della condotta e, nei casi urgenti o gravi, sospendere l’autorizzazione all’utilizzo e/o risolvere il contratto, fatto salvo il risarcimento degli eventuali danni e gli ulteriori rimedi previsti dalla legge.</p>
<p>Conseguenze economiche della rinuncia, della cancellazione o della risoluzione, se concordate: ${textBlock(c.cancellation, 100)}.</p>
</div>

<div class="article">
<h2>Art. 6 – Pulizia, danni e ripristino</h2>
<p>Il Concessionario deve mantenere l’Area Concessa in condizioni decorose, provvedere alla raccolta e rimozione dei rifiuti prodotti e riconsegnare l’area libera da persone, materiali e attrezzature entro l’orario concordato.</p>
<p>Il Concessionario è tenuto a ripristinare a proprie spese eventuali danni o alterazioni imputabili a sé o ai soggetti di cui si avvale, salvo il normale deterioramento derivante dall’uso autorizzato. Gli eventuali costi dovranno essere documentati.</p>
</div>

<div class="article">
<h2>Art. 7 – Accordi, allegati e modifiche</h2>
<p>Le condizioni relative a durata, corrispettivo, attività, utenze e modalità d’uso sono quelle riportate nel presente contratto e nei relativi allegati sottoscritti dalle parti. Accordi verbali o utilizzi di fatto non possono modificare le condizioni scritte.</p>
<div class="options"><p>Costituiscono allegati, ove presenti: ${attachments}; ${box(!!other)}altri: ${fill(other, 60)}.</p></div>
<p>Ogni modifica o integrazione deve risultare da atto scritto approvato da entrambe le parti.</p>
</div>

<div class="article">
<h2>Art. 8 – Disposizioni finali</h2>
<p>Per quanto non previsto dal presente contratto si applicano le disposizioni di legge vigenti. L’eventuale invalidità di una clausola non comporta, ove possibile, l’invalidità dell’intero accordo.</p>
</div>

<div style="break-inside: avoid">
<h2>Sottoscrizione</h2>
<p>Luogo ${fill(c.place, 60)}, data ${fillDate(c.signedOn)}.</p>
<div class="signs">
  ${signatureBlock('Il Concedente – Pro Loco Tempo Libero Vigne', c.grantorName, c.presidentSignature)}
  ${signatureBlock('Il Concessionario', c.representative || c.holderName, false)}
</div>
</div>

<div style="break-inside: avoid; margin-top: 4mm">
<h2>Approvazione specifica</h2>
<p>Il Concessionario dichiara di approvare specificamente, ove applicabili e nei limiti di legge, le clausole relative a: destinazione d’uso e divieti (art. 1); durata e corrispettivo (art. 2); utenze e limiti tecnici (art. 3); obblighi, responsabilità, assicurazione e manleva (art. 4); controlli, sospensione e risoluzione (art. 5); pulizia, danni e ripristino (art. 6).</p>
<div class="approval">
  <span>Firma del Concessionario</span>
  <span class="approval-line"></span>
</div>
</div>`;
  return page(`Contratto ${number}`, body);
}

export const parkClientPatch = (c: ParkContractData) => ({
  address: c.holderSeat.trim() || undefined,
  tax_code: c.holderTaxCode.trim().toUpperCase() || undefined,
});
