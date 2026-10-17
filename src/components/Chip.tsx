import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, font } from '@/theme/tokens';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /** dark = filtri, accent = scelte principali (luogo, unità) */
  variant?: 'dark' | 'accent';
};

export function Chip({ label, active = false, onPress, variant = 'dark' }: Props) {
  const activeBg = variant === 'dark' ? colors.text : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active ? { backgroundColor: activeBg, borderColor: activeBg } : styles.idle,
        pressed && !active && styles.pressed,
      ]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { backgroundColor: colors.segment },
  label: { fontFamily: font.bold, fontSize: 13, color: colors.text },
  labelActive: { color: '#FFFFFF' },
});
