import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatQty, itemNote, locationLabel, stepFor, type Item, unitWord } from '@/lib/items';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/components/itemRow';

type Props = {
  item: Item;
  isFirst: boolean;
  isLast: boolean;
  onAdjust?: (delta: number) => void;
  showLocation?: boolean;
  highlight?: string;
  onPress?: () => void;
};

export function ItemRow({ item, isFirst, isLast, onAdjust, showLocation, highlight, onPress }: Props) {
  const note = itemNote(item);
  const step = stepFor(item.unit);
  const cantRemove = item.qty - step < item.broken_qty;

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
          {showLocation && <Text style={styles.place}>{locationLabel(item.location)}</Text>}
          <Text style={[type.caption, note.alert && { color: colors.warn }]} numberOfLines={1}>
            {note.text}
          </Text>
        </View>
      </View>

      {onAdjust && (
        <Pressable
          onPress={() => press(-step)}
          disabled={cantRemove}
          accessibilityLabel={`${item.name}: togli ${formatQty(step)} ${item.unit}`}
          style={({ pressed }) => [
            styles.step,
            cantRemove && styles.stepDisabled,
            pressed && styles.stepPressed,
          ]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
      )}

      <View style={styles.qty}>
        <Text style={[type.number, note.alert && { color: colors.warn }]}>{formatQty(item.qty)}</Text>
        <Text style={styles.unit}>{unitWord(item.qty, item.unit)}</Text>
      </View>

      {onAdjust && (
        <Pressable
          onPress={() => press(step)}
          accessibilityLabel={`${item.name}: aggiungi ${formatQty(step)} ${item.unit}`}
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
    return (
      <Text style={type.body} numberOfLines={1}>
        {name}
      </Text>
    );
  }

  return (
    <Text style={type.body} numberOfLines={1}>
      {name.slice(0, at)}
      <Text style={styles.mark}>{name.slice(at, at + term.length)}</Text>
      {name.slice(at + term.length)}
    </Text>
  );
}
