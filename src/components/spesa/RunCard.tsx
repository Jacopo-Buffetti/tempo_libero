import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { qtyWithUnit } from '@/lib/items';
import {
  centsToInput,
  formatEuro,
  parseEuro,
  runDateLabel,
  useSetListItemPrice,
  useSetPaymentsReimbursed,
  type ListItem,
  type Run,
} from '@/lib/spesa';
import { Scontrini } from '@/components/spesa/Scontrini';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/runCard';

type Props = {
  run: Run;
  index: number;
  listId: string;
  orgId?: string;
  items: ListItem[];
  payerName: string;
  initiallyOpen?: boolean;
};

export function RunCard({ run, index, listId, orgId, items, payerName, initiallyOpen = false }: Props) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const reimburse = useSetPaymentsReimbursed();
  const setPrice = useSetListItemPrice(listId);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrices((current) => {
      const next = { ...current };
      items.forEach((l) => {
        if (next[l.id] === undefined) next[l.id] = centsToInput(l.price_cents);
      });
      return next;
    });
  }, [items]);

  function commit(id: string, saved: number | null) {
    const text = prices[id] ?? '';
    const cents = parseEuro(text);
    if (text.trim() !== '' && cents == null) {
      setError('Prezzo non valido: usa un formato come 6,90');
      return;
    }
    setError(null);
    if (cents !== saved) setPrice.mutate({ id, cents });
  }

  const volunteer = run.paid_by === 'volontario';
  const details = [
    runDateLabel(run.run_date),
    run.shop,
    `${run.items_count} ${run.items_count === 1 ? 'articolo' : 'articoli'}`,
    run.receipts_count ? `${run.receipts_count} ${run.receipts_count === 1 ? 'scontrino' : 'scontrini'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.head, pressed && styles.headPressed]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={type.body} numberOfLines={1}>
            {payerName}
          </Text>
          <Text style={type.caption} numberOfLines={1}>
            {details}
          </Text>
          {volunteer && (
            <Text style={[type.caption, !run.reimbursed && styles.warnText]} numberOfLines={1}>
              {run.reimbursed ? 'Rimborsato' : 'Da rimborsare'}
            </Text>
          )}
        </View>
        {run.amount_missing ? (
          <Text style={styles.missing}>da inserire</Text>
        ) : (
          <Text style={styles.total}>{formatEuro(run.total_cents)}</Text>
        )}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={styles.body}>
          {volunteer && (
            <View style={styles.payer}>
              <Ionicons name="person-outline" size={18} color={colors.text} />
              <View style={styles.flex}>
                <Text style={styles.payerText}>{payerName}</Text>
                <Text style={[type.caption, !run.reimbursed && styles.warnText]}>
                  {run.reimbursed
                    ? run.reimbursed_on
                      ? `Rimborsato il ${runDateLabel(run.reimbursed_on)}`
                      : 'Rimborsato'
                    : 'Da rimborsare'}
                </Text>
              </View>
              <Pressable
                onPress={() => reimburse.mutate({ ids: [run.id], value: !run.reimbursed })}
                disabled={reimburse.isPending}
                style={({ pressed }) => [
                  styles.refund,
                  run.reimbursed && styles.refundUndo,
                  pressed && styles.refundPressed,
                ]}
              >
                <Text style={[styles.refundText, run.reimbursed && styles.refundUndoText]}>
                  {run.reimbursed ? 'Annulla' : 'Rimborsato'}
                </Text>
              </Pressable>
            </View>
          )}

          <Scontrini orgId={orgId} listId={listId} runId={run.id} title="Scontrini di questo pagamento" />

          {items.length > 0 && (
            <View style={styles.items}>
              {items.map((l, i) => {
                const text = prices[l.id] ?? '';
                const bad = text.trim() !== '' && parseEuro(text) == null;
                return (
                  <View key={l.id} style={[styles.line, i < items.length - 1 && styles.divider]}>
                    <View style={styles.flex}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text style={type.caption}>{qtyWithUnit(l.qty, l.unit)}</Text>
                    </View>
                    <View style={[styles.priceBox, bad && styles.priceBad]}>
                      <Text style={styles.euro}>€</Text>
                      <TextInput
                        value={text}
                        onChangeText={(v) => setPrices((p) => ({ ...p, [l.id]: v }))}
                        onEndEditing={() => commit(l.id, l.price_cents)}
                        placeholder="—"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Prezzo di ${l.name}`}
                        style={styles.priceInput}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={() => router.push({ pathname: '/spesa/pagamento', params: { listId, id: run.id } })}
            style={({ pressed }) => [styles.edit, pressed && styles.editPressed]}
          >
            <Ionicons name="create-outline" size={18} color={colors.accent} />
            <Text style={styles.editText}>
              {run.amount_missing ? 'Inserisci importo o modifica' : 'Modifica pagamento'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
