import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { itemNote, locationLabel, type Item } from '@/lib/items';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

type Props = {
  item: Item;
  isFirst: boolean;
  isLast: boolean;
  /** Se presente mostra i pulsanti − e + */
  onAdjust?: (delta: number) => void;
  /** Mostra l'etichetta del luogo (utile nella ricerca) */
  showLocation?: boolean;
  /** Parte del nome da evidenziare */
  highlight?: string;
  /** Tocco sulla riga: apre il dettaglio */
  onPress?: () => void;
};

export function ItemRow({
  item,
  isFirst,
  isLast,
  onAdjust,
  showLocation,
  highlight,
  onPress,
}: Props) {
  const note = itemNote(item);

  function press(delta: number) {
    Haptics.selectionAsync();
    onAdjust?.(delta);
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Apre il dettaglio' : undefined}
      style={({ pressed }) => [
        styles.row,
        isFirst && styles.first,
        isLast && styles.last,
        !isLast && styles.divider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.badge, note.alert && styles.badgeAlert]}>
        <Text style={[styles.badgeText, note.alert && { color: colors.warn }]}>
          {item.name[0]?.toUpperCase()}
        </Text>
      </View>

      <View style={styles.text}>
        <Name name={item.name} highlight={highlight} />
        <View style={styles.meta}>
          {showLocation && (
            <Text style={styles.place}>{locationLabel(item.location)}</Text>
          )}
          <Text style={[type.caption, note.alert && { color: colors.warn }]} numberOfLines={1}>
            {note.text}
          </Text>
        </View>
      </View>

      {onAdjust && (
        <Pressable
          onPress={() => press(-1)}
          disabled={item.qty <= item.broken_qty}
          accessibilityLabel={`Togli un ${item.name}`}
          style={({ pressed }) => [
            styles.step,
            item.qty <= item.broken_qty && styles.stepDisabled,
            pressed && styles.stepPressed,
          ]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
      )}

      <View style={styles.qty}>
        <Text style={[type.number, note.alert && { color: colors.warn }]}>{item.qty}</Text>
        <Text style={styles.unit}>{item.unit}</Text>
      </View>

      {onAdjust && (
        <Pressable
          onPress={() => press(1)}
          accessibilityLabel={`Aggiungi un ${item.name}`}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function Name({ name, highlight }: { name: string; highlight?: string }) {
  const term = highlight?.trim();
  const at = term ? name.toLowerCase().indexOf(term.toLowerCase()) : -1;

  if (!term || at < 0) {
    return <Text style={type.body} numberOfLines={1}>{name}</Text>;
  }

  return (
    <Text style={type.body} numberOfLines={1}>
      {name.slice(0, at)}
      <Text style={styles.mark}>{name.slice(at, at + term.length)}</Text>
      {name.slice(at + term.length)}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    paddingVertical: space(3),
    paddingHorizontal: space(3),
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: '#F7F8FC' },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },

  badge: {
    width: touch,
    height: touch,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeAlert: { backgroundColor: colors.warnSoft },
  badgeText: { fontFamily: font.black, fontSize: 16, color: colors.accent },

  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  place: {
    fontFamily: font.bold,
    fontSize: 11,
    color: colors.muted,
    backgroundColor: colors.bg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  mark: { backgroundColor: '#FFF1C2' },

  step: {
    width: 40,
    height: touch,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: { opacity: 0.35 },
  stepPressed: { backgroundColor: colors.segment },
  stepText: { fontFamily: font.bold, fontSize: 20, color: colors.text },

  qty: { minWidth: 44, alignItems: 'center' },
  unit: { fontFamily: font.medium, fontSize: 11, color: colors.muted },
});
