import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { qtyWithUnit } from '@/lib/items';
import {
  centsToInput,
  formatEuro,
  parseEuro,
  runDateLabel,
  useSetListItemPrice,
  useSetRunReimbursed,
  type ListItem,
  type Run,
} from '@/lib/spesa';
import { Scontrini } from '@/components/spesa/Scontrini';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/components/runCard';

type Props = {
  run: Run;
  index: number;
  listId: string;
  orgId?: string;
  items: ListItem[];
  payerName: string;
  editable?: boolean;
  initiallyOpen?: boolean;
};

export function RunCard({
  run,
  index,
  listId,
  orgId,
  items,
  payerName,
  editable = true,
  initiallyOpen = false,
}: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const reimburse = useSetRunReimbursed(listId);
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

  const warnings = run.receipts_missing + run.prices_missing;
  const volunteer = run.paid_by === 'volontario';

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
            {runDateLabel(run.run_date)}
            {run.shop ? ` · ${run.shop}` : ''}
          </Text>
          <Text style={[type.caption, warnings > 0 && styles.warnText]} numberOfLines={1}>
            {run.items_count} {run.items_count === 1 ? 'articolo' : 'articoli'}
            {run.receipts_count
              ? ` · ${run.receipts_count} ${run.receipts_count === 1 ? 'scontrino' : 'scontrini'}`
              : ''}
            {warnings > 0 ? ' · importi da completare' : ''}
          </Text>
        </View>
        <Text style={styles.total}>{formatEuro(run.total_cents)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={styles.body}>
          <View style={styles.payer}>
            <Ionicons name={volunteer ? 'person-outline' : 'wallet-outline'} size={18} color={colors.text} />
            <View style={styles.flex}>
              <Text style={styles.payerText}>{payerName}</Text>
              {volunteer && (
                <Text style={[type.caption, !run.reimbursed && styles.warnText]}>
                  {run.reimbursed ? 'Già rimborsata' : 'Da rimborsare'}
                </Text>
              )}
            </View>
            {volunteer && (
              <Pressable
                onPress={() => reimburse.mutate({ id: run.id, value: !run.reimbursed })}
                disabled={reimburse.isPending}
                style={({ pressed }) => [
                  styles.refund,
                  run.reimbursed && styles.refundUndo,
                  pressed && styles.refundPressed,
                ]}
              >
                <Text style={[styles.refundText, run.reimbursed && styles.refundUndoText]}>
                  {run.reimbursed ? 'Annulla' : 'Rimborsata'}
                </Text>
              </Pressable>
            )}
          </View>

          {editable ? (
            <Scontrini orgId={orgId} listId={listId} runId={run.id} title="Scontrini di questa spesa" />
          ) : null}

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
                        placeholder={run.receipts_count ? '—' : '0,00'}
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
        </View>
      )}
    </View>
  );
}
