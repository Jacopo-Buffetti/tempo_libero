import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { LOCATIONS, itemsKeys, locationLabel, movementsKeys } from '@/lib/items';
import {
  exportInventory,
  fetchInventory,
  importItems,
  pickCsv,
  readImport,
  shareTemplate,
  type ExportFormat,
  type ExportScope,
  type ImportProblem,
  type ImportRow,
} from '@/lib/inventarioFile';
import { quantityLabel } from '@/lib/condividiLista';
import { errorMessage } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/datiInventario';

const FORMATS: { value: ExportFormat; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { value: 'pdf', label: 'PDF', hint: 'Da stampare o mandare', icon: 'document-text-outline' },
    { value: 'csv', label: 'CSV', hint: 'Per Excel o Fogli Google', icon: 'grid-outline' },
    { value: 'txt', label: 'TXT', hint: 'Testo semplice', icon: 'reader-outline' },
  ];

type Preview = { fileName: string; rows: ImportRow[]; problems: ImportProblem[] };

export default function DatiInventario() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<ExportScope>('tutto');
  const [busy, setBusy] = useState<ExportFormat | 'pick' | 'import' | 'template' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: ExportFormat) {
    if (!orgId) return;
    setError(null);
    setBusy(format);
    try {
      await exportInventory(orgId, scope, format);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Esportazione non riuscita. Riprova.');
    } finally {
      setBusy(null);
    }
  }

  async function template() {
    setError(null);
    setBusy('template');
    try {
      await shareTemplate();
    } catch {
      setError('Non riesco a creare il modello. Riprova.');
    } finally {
      setBusy(null);
    }
  }

  async function choose() {
    if (!orgId) return;
    setError(null);
    setBusy('pick');
    try {
      const file = await pickCsv();
      if (!file) return;
      const existing = await fetchInventory(orgId, 'tutto');
      const { rows, problems } = readImport(file.text, existing);
      setPreview({ fileName: file.name, rows, problems });
    } catch (e) {
      const detail = e instanceof Error && e.message ? e.message : '';
      setError(
        detail.includes('CSV') ? detail : `Non riesco a leggere il file.${detail ? ` (${detail})` : ''}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!orgId || !preview) return;
    setBusy('import');
    try {
      const result = await importItems(orgId, preview.rows);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      queryClient.invalidateQueries({ queryKey: movementsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['spesa'] });
      setPreview(null);
      Alert.alert(
        'Inventario aggiornato',
        `${result.created} ${result.created === 1 ? 'oggetto nuovo' : 'oggetti nuovi'} e ${result.updated} ${result.updated === 1 ? 'aggiornato' : 'aggiornati'}.`,
        [{ text: 'Ok', onPress: () => router.back() }],
      );
    } catch (e) {
      setError(errorMessage(e, 'Importazione non riuscita. Nessun dato è stato modificato.'));
    } finally {
      setBusy(null);
    }
  }

  const created = preview?.rows.filter((r) => r.action === 'nuovo').length ?? 0;
  const updated = preview?.rows.filter((r) => r.action === 'aggiorna').length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Inventario</Text>
        </Pressable>
        <Text style={type.heading}>Esporta e importa</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!preview && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Scarica l’inventario</Text>
              <View style={styles.chips}>
                <Chip
                  label="Tutto"
                  variant="accent"
                  active={scope === 'tutto'}
                  onPress={() => setScope('tutto')}
                />
                {LOCATIONS.map((l) => (
                  <Chip
                    key={l.value}
                    label={l.label}
                    variant="accent"
                    active={scope === l.value}
                    onPress={() => setScope(l.value)}
                  />
                ))}
              </View>
              <View style={styles.formats}>
                {FORMATS.map((f) => (
                  <Pressable
                    key={f.value}
                    onPress={() => download(f.value)}
                    disabled={busy !== null}
                    style={({ pressed }) => [styles.format, pressed && styles.formatPressed]}
                  >
                    {busy === f.value ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Ionicons name={f.icon} size={26} color={colors.accent} />
                    )}
                    <Text style={styles.formatLabel}>{f.label}</Text>
                    <Text style={styles.formatHint}>{f.hint}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Carica da CSV</Text>
              <Text style={type.caption}>
                Colonne: nome, luogo (magazzino, cucina o bar), quantita e, se vuoi, tipo, unita,
                scorta_minima, da_riparare. Gli oggetti che esistono già nello stesso luogo vengono
                aggiornati, gli altri creati. Va bene anche un CSV salvato da Excel.
              </Text>
              <Pressable
                onPress={choose}
                disabled={busy !== null}
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              >
                {busy === 'pick' ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={20} color={colors.onAccent} />
                    <Text style={styles.primaryText}>Scegli il file CSV</Text>
                  </>
                )}
              </Pressable>
              <Pressable onPress={template} disabled={busy !== null} style={styles.link}>
                {busy === 'template' ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.linkText}>Scarica un modello da compilare</Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        {preview && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Controlla prima di importare</Text>
            <Text style={type.caption}>{preview.fileName}</Text>

            <View style={styles.summary}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryNumber}>{created}</Text>
                <Text style={styles.summaryLabel}>Nuovi</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryNumber}>{updated}</Text>
                <Text style={styles.summaryLabel}>Da aggiornare</Text>
              </View>
              <View style={[styles.summaryBox, preview.problems.length > 0 && styles.summaryWarn]}>
                <Text style={styles.summaryNumber}>{preview.problems.length}</Text>
                <Text style={styles.summaryLabel}>Avvisi</Text>
              </View>
            </View>

            {preview.problems.length > 0 && (
              <View style={styles.problems}>
                {preview.problems.map((p, i) => (
                  <Text key={i} style={styles.problemText}>
                    {p.line > 0 ? `Riga ${p.line}: ` : ''}
                    {p.text}
                  </Text>
                ))}
              </View>
            )}

            {preview.rows.length > 0 && (
              <View style={styles.card}>
                {preview.rows.map((r, i) => (
                  <View
                    key={`${r.location}-${r.name}`}
                    style={[styles.row, i < preview.rows.length - 1 && styles.divider]}
                  >
                    <View style={styles.flex}>
                      <Text style={type.body} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={type.caption}>
                        {locationLabel(r.location)} ·{' '}
                        {r.kind === 'consumabile' ? 'consumabile' : 'attrezzatura'}
                        {r.min_qty != null ? ` · minimo ${quantityLabel(r.min_qty, r.unit)}` : ''}
                        {r.broken_qty > 0 ? ` · ${r.broken_qty} da riparare` : ''}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.qty}>{quantityLabel(r.qty, r.unit)}</Text>
                      <Text
                        style={[styles.badge, r.action === 'nuovo' ? styles.badgeNew : styles.badgeUpdate]}
                      >
                        {r.action === 'nuovo' ? 'Nuovo' : 'Aggiorna'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {preview && (
        <View style={styles.footer}>
          <Pressable onPress={() => setPreview(null)} disabled={busy === 'import'} style={styles.secondary}>
            <Text style={styles.secondaryText}>Annulla</Text>
          </Pressable>
          <Pressable
            onPress={confirmImport}
            disabled={preview.rows.length === 0 || busy === 'import'}
            style={({ pressed }) => [
              styles.primary,
              styles.flex,
              preview.rows.length === 0 && styles.disabled,
              pressed && styles.primaryPressed,
            ]}
          >
            {busy === 'import' ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryText}>
                Importa {preview.rows.length} {preview.rows.length === 1 ? 'riga' : 'righe'}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
