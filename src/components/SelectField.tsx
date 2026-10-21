import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/selectField';

export type SelectOption = { key: string; label: string; hint?: string };

type Props = {
  title: string;
  placeholder: string;
  options: SelectOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function SelectField({ title, placeholder, options, selectedKey, onSelect, icon = 'person-outline' }: Props) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === selectedKey) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `${title}: ${selected.label}` : placeholder}
        style={({ pressed }) => [styles.field, selected && styles.fieldActive, pressed && styles.fieldPressed]}
      >
        <Ionicons name={icon} size={20} color={selected ? colors.onAccent : colors.muted} />
        <Text style={[styles.value, !selected && styles.placeholder, selected && styles.valueActive]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={selected ? colors.onAccent : colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Chiudi" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={type.heading}>{title}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Chiudi">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {options.map((o, i) => {
              const active = o.key === selectedKey;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    onSelect(o.key);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.option,
                    i < options.length - 1 && styles.optionDivider,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={styles.flex}>
                    <Text style={[type.body, active && styles.optionActive]}>{o.label}</Text>
                    {!!o.hint && <Text style={type.caption}>{o.hint}</Text>}
                  </View>
                  {active && <Ionicons name="checkmark" size={22} color={colors.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
