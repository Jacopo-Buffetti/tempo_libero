import { Pressable, Text } from 'react-native';
import { colors } from '@/theme/tokens';
import { styles } from '@/styles/components/chip';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
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
