import type { ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { parseEuro } from '@/lib/spesa';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/components/formField';

type FieldProps = Omit<TextInputProps, 'style'> & { label: string; hint?: string; warn?: string | null };

export function Field({ label, hint, warn, multiline, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, !!warn && styles.inputWarn]}
        {...input}
      />
      {warn ? (
        <Text style={styles.warn}>{warn}</Text>
      ) : hint ? (
        <Text style={type.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function MoneyField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  const bad = value.trim() !== '' && parseEuro(value) == null;
  return (
    <View style={styles.moneyRow}>
      <Text style={[type.body, styles.flex]}>{label}</Text>
      <View style={[styles.moneyBox, bad && styles.inputWarn]}>
        <Text style={styles.euro}>€</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="0,00"
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          style={styles.moneyInput}
        />
      </View>
    </View>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!hint && <Text style={type.caption}>{hint}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}
