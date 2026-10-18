import { Pressable, Text, TextInput, View } from 'react-native';
import type { PriceMode } from '@/lib/menu';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/components/priceModeField';

type Props = {
  mode: PriceMode;
  onChangeMode: (mode: PriceMode) => void;
  price: string;
  onChangePrice: (text: string) => void;
  note: string;
  onChangeNote: (text: string) => void;
  priceInvalid?: boolean;
};

export function PriceModeField({
  mode,
  onChangeMode,
  price,
  onChangePrice,
  note,
  onChangeNote,
  priceInvalid,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.segment}>
        {(
          [
            { value: 'per_piatto', label: 'Prezzo per piatto' },
            { value: 'fisso', label: 'Menù fisso' },
          ] as const
        ).map((m) => {
          const active = m.value === mode;
          return (
            <Pressable
              key={m.value}
              onPress={() => onChangeMode(m.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'per_piatto' ? (
        <Text style={type.caption}>Ogni piatto ha il suo prezzo, da inserire nella scheda del piatto.</Text>
      ) : (
        <View style={styles.card}>
          <View style={styles.priceRow}>
            <Text style={[type.body, styles.flex]}>A persona</Text>
            <View style={[styles.priceBox, priceInvalid && styles.bad]}>
              <Text style={styles.euro}>€</Text>
              <TextInput
                value={price}
                onChangeText={onChangePrice}
                placeholder="0,00"
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                accessibilityLabel="Prezzo del menù a persona"
                style={styles.priceInput}
              />
            </View>
          </View>
          <TextInput
            value={note}
            onChangeText={onChangeNote}
            placeholder="Nota facoltativa: bevande escluse, bambini € 10…"
            placeholderTextColor={colors.muted}
            style={styles.note}
          />
          <Text style={type.caption}>
            I piatti vengono mostrati senza prezzo: vale quello del menù.
          </Text>
        </View>
      )}
    </View>
  );
}
