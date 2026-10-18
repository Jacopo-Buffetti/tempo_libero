import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { localIsoDate, shortTime } from '@/lib/menu';
import { colors } from '@/theme/tokens';
import { styles } from '@/styles/components/dateTimeField';

type Props = {
  date: string | null;
  time: string | null;
  onChangeDate: (iso: string) => void;
  onChangeTime: (time: string | null) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export function DateTimeField({ date, time, onChangeDate, onChangeTime }: Props) {
  const value = new Date(`${date ?? localIsoDate()}T${time ?? '18:00:00'}`);

  const dateLabel = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Scegli la data';

  function openAndroid(mode: 'date' | 'time') {
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: true,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== 'set' || !picked) return;
        if (mode === 'date') onChangeDate(localIsoDate(picked));
        else onChangeTime(toTime(picked));
      },
    });
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.card}>
        <View style={[styles.row, styles.divider]}>
          <Ionicons name="calendar-outline" size={20} color={colors.accent} />
          <Text style={styles.label}>Data</Text>
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            locale="it-IT"
            onChange={(_e, picked) => picked && onChangeDate(localIsoDate(picked))}
          />
        </View>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={20} color={colors.accent} />
          <Text style={styles.label}>Ora</Text>
          {time ? (
            <>
              <DateTimePicker
                value={value}
                mode="time"
                display="compact"
                locale="it-IT"
                onChange={(_e, picked) => picked && onChangeTime(toTime(picked))}
              />
              <Pressable onPress={() => onChangeTime(null)} hitSlop={8} accessibilityLabel="Togli l’ora">
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => onChangeTime('18:00:00')} style={styles.addTime}>
              <Text style={styles.addTimeText}>Aggiungi ora</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => openAndroid('date')}
        accessibilityRole="button"
        accessibilityLabel={`Data: ${dateLabel}`}
        style={({ pressed }) => [styles.row, styles.divider, pressed && styles.pressed]}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.accent} />
        <Text style={[styles.value, !date && styles.placeholder]}>
          {date ? dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) : dateLabel}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <View style={styles.row}>
        <Ionicons name="time-outline" size={20} color={colors.accent} />
        <Pressable
          onPress={() => openAndroid('time')}
          accessibilityRole="button"
          accessibilityLabel={time ? `Ora: ${shortTime(time)}` : 'Aggiungi ora'}
          style={styles.timePress}
        >
          <Text style={[styles.value, !time && styles.placeholder]}>
            {time ? `Ore ${shortTime(time)}` : 'Aggiungi ora (facoltativa)'}
          </Text>
        </Pressable>
        {time ? (
          <Pressable onPress={() => onChangeTime(null)} hitSlop={8} accessibilityLabel="Togli l’ora">
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        )}
      </View>
    </View>
  );
}
