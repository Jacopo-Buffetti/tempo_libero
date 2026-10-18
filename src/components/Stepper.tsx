import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatQty, parseQty, roundQty, unitInfo } from '@/lib/items';
import { styles } from '@/styles/components/stepper';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  max?: number;
};

export function Stepper({ label, value, onChange, unit = 'pezzi', min = 0, max = 99999 }: Props) {
  const { step, decimals } = unitInfo(unit);
  const clamp = (n: number) => Math.min(max, Math.max(min, roundQty(n)));

  const [text, setText] = useState(formatQty(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(formatQty(value));
  }, [value, editing]);

  function stepBy(direction: 1 | -1) {
    const next = clamp(value + direction * step);
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  }

  function commit() {
    setEditing(false);
    const n = parseQty(text, unit);
    const next = n == null ? min : clamp(n);
    setText(formatQty(next));
    if (next !== value) onChange(next);
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => stepBy(-1)}
        disabled={value <= min}
        accessibilityLabel={`${label}: togli ${formatQty(step)}`}
        style={({ pressed }) => [styles.button, value <= min && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>

      <TextInput
        value={text}
        onChangeText={(t) => {
          setEditing(true);
          setText(decimals > 0 ? t.replace(/[^\d,.]/g, '') : t.replace(/\D/g, ''));
        }}
        onFocus={() => setEditing(true)}
        onEndEditing={commit}
        onSubmitEditing={commit}
        keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        accessibilityLabel={label}
        style={styles.input}
        maxLength={8}
      />

      <Pressable
        onPress={() => stepBy(1)}
        disabled={value >= max}
        accessibilityLabel={`${label}: aggiungi ${formatQty(step)}`}
        style={({ pressed }) => [styles.button, value >= max && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}
