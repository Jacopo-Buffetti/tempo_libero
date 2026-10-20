import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LOCATIONS, type Location } from '@/lib/items';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/locationPicker';

const LOCATION_ICONS: Record<Location, keyof typeof Ionicons.glyphMap> = {
  magazzino: 'cube-outline',
  cucina: 'flame-outline',
  bar: 'wine-outline',
};

type Props = {
  value: Location[];
  onChange: (value: Location[]) => void;
};

export function LocationPicker({ value, onChange }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  function toggle(location: Location) {
    const selected = value.includes(location);
    if (selected && value.length === 1) return;
    Haptics.selectionAsync();
    onChange(selected ? value.filter((l) => l !== location) : [...value, location]);
  }

  return (
    <View style={styles.tiles}>
      {LOCATIONS.map((l) => {
        const active = value.includes(l.value);
        return (
          <Pressable
            key={l.value}
            onPress={() => toggle(l.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            style={[styles.tile, active && styles.tileActive]}
          >
            {active && (
              <View style={styles.check}>
                <Ionicons name="checkmark" size={12} color={colors.accent} />
              </View>
            )}
            <Ionicons
              name={LOCATION_ICONS[l.value]}
              size={26}
              color={active ? colors.onAccent : colors.text}
            />
            <Text style={[styles.tileText, active && styles.tileTextActive]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
