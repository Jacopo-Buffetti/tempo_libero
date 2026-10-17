import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, touch } from '@/theme/tokens';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

/** − numero + ; il numero si può anche scrivere (comodo per 312 sedie) */
export function Stepper({ label, value, onChange, min = 0, max = 99999 }: Props) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  function step(delta: number) {
    const next = clamp(value + delta);
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  }

  function type(text: string) {
    const digits = text.replace(/\D/g, '');
    onChange(digits === '' ? min : clamp(parseInt(digits, 10)));
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => step(-1)}
        disabled={value <= min}
        accessibilityLabel={`${label}: togli uno`}
        style={({ pressed }) => [
          styles.button,
          value <= min && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>

      <TextInput
        value={String(value)}
        onChangeText={type}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={label}
        style={styles.input}
        maxLength={5}
      />

      <Pressable
        onPress={() => step(1)}
        disabled={value >= max}
        accessibilityLabel={`${label}: aggiungi uno`}
        style={({ pressed }) => [
          styles.button,
          value >= max && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  button: {
    width: touch,
    height: touch,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: colors.segment },
  buttonText: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  input: {
    minWidth: 56,
    height: touch,
    textAlign: 'center',
    fontFamily: font.black,
    fontSize: 20,
    color: colors.text,
    padding: 0,
  },
});
