# Richiesta cancellazione account – Tempo Libero Vigne

## Modifiche
- `src/app/(app)/impostazioni.tsx`: pulsante con conferma e stato di invio.
- `supabase/migrations/20261110120000_richieste_cancellazione.sql`: tabella richieste, RLS attiva senza policy pubbliche.
- `supabase/functions/richiedi-cancellazione/index.ts`: autenticazione Supabase, registrazione della richiesta e email al Presidente tramite Resend.

## Attivazione
1. Applicare la migrazione sul progetto Supabase (es. `pnpm exec supabase db push` dopo verifica della connessione e delle migrazioni).
2. Configurare un mittente verificato su Resend (dominio di invio verificato). Un indirizzo Gmail **non** può essere usato come mittente Resend senza dominio verificato; Gmail resta il destinatario.
3. Impostare i segreti sulla dashboard Supabase Edge Functions o da terminale: `RESEND_API_KEY` e `DELETION_EMAIL_FROM` (es. `Tempo Libero Vigne <privacy@dominio-verificato.it>`). **Non inserire questi valori in EXPO_PUBLIC_ o nell'app.**
4. Distribuire la funzione: `pnpm exec supabase functions deploy richiedi-cancellazione`.
5. Provare con un utente autorizzato: Impostazioni → Account → Richiedi cancellazione account → Invia richiesta. Verificare sia la mail sia `account_deletion_requests`.
6. Pubblicare una nuova build iOS (la build 1.0.0 (2) già caricata non contiene il pulsante).

## Comportamento
- Nessuna cancellazione automatica: il Presidente la esegue tramite gestione membri.
- Una richiesta notificata non viene inviata nuovamente per lo stesso utente/associazione; per una nuova richiesta dopo annullamento o gestione è necessario aggiornare il flusso amministrativo.
- Se l'email fallisce, la richiesta resta nel database e l'utente riceve un messaggio di errore con contatto alternativo.
- Verificare che il processo amministrativo di cancellazione rimuova effettivamente tutti i dati personali pertinenti e che la privacy policy descriva le eccezioni legali.
