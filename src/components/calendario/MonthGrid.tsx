import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WEEKDAYS, addMonths, dateOf, monthGrid, monthTitle, todayIso } from '@/lib/calendario';
import { colors } from '@/theme/tokens';
import { styles } from '@/styles/components/monthGrid';

export type DayInfo = {
  label?: string;
  muted?: boolean;
  highlight?: boolean;
  dots?: string[];
};

type Props = {
  month: string;
  onMonthChange: (month: string) => void;
  selected: string | null;
  onSelect: (iso: string) => void;
  info: (iso: string) => DayInfo;
};

export function MonthGrid({ month, onMonthChange, selected, onSelect, info }: Props) {
  const days = monthGrid(month);
  const today = todayIso();

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <Pressable
          onPress={() => onMonthChange(addMonths(month, -1))}
          hitSlop={8}
          accessibilityLabel="Mese precedente"
          style={styles.navButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </Pressable>
        <Pressable onPress={() => onMonthChange(today.slice(0, 7))} accessibilityLabel="Torna a oggi">
          <Text style={styles.title}>{monthTitle(month)}</Text>
        </Pressable>
        <Pressable
          onPress={() => onMonthChange(addMonths(month, 1))}
          hitSlop={8}
          accessibilityLabel="Mese successivo"
          style={styles.navButton}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={[styles.weekday, i >= 5 && styles.weekdayEnd]}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((iso, i) => {
          if (!iso) return <View key={`v${i}`} style={styles.cell} />;
          const d = info(iso);
          const isSelected = iso === selected;
          return (
            <Pressable
              key={iso}
              onPress={() => onSelect(iso)}
              accessibilityLabel={dateOf(iso).toLocaleDateString('it-IT', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              style={[
                styles.cell,
                styles.day,
                d.muted && styles.dayMuted,
                d.highlight && styles.dayHighlight,
                isSelected && styles.daySelected,
              ]}
            >
              <Text
                style={[
                  styles.number,
                  iso === today && styles.today,
                  isSelected && styles.numberSelected,
                  d.muted && styles.numberMuted,
                ]}
              >
                {dateOf(iso).getDate()}
              </Text>
              {!!d.label && (
                <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
                  {d.label}
                </Text>
              )}
              {!!d.dots?.length && (
                <View style={styles.dots}>
                  {d.dots.slice(0, 3).map((c, k) => (
                    <View
                      key={k}
                      style={[styles.dot, { backgroundColor: isSelected ? colors.onAccent : c }]}
                    />
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
