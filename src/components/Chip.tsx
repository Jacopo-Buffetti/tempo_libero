import { Pressable, Text } from 'react-native';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/chip';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  variant?: 'dark' | 'accent';
};

export function Chip({ label, active = false, onPress, variant = 'dark' }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const activeBg = variant === 'dark' ? colors.inverse : colors.accent;
  const activeText = variant === 'dark' ? colors.inverseText : colors.onAccent;

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
      <Text style={[styles.label, active && { color: activeText }]}>{label}</Text>
    </Pressable>
  );
}
