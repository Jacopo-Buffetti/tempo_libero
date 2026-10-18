import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/tokens';
import { styles } from '@/styles/components/timeField';

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  fallback?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export function TimeField({ label, value, onChange, fallback = '20:00:00' }: Props) {
  const date = new Date(`2000-01-01T${value ?? fallback}`);

  function open() {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'time',
      is24Hour: true,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type === 'set' && picked) onChange(toTime(picked));
      },
    });
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' && value ? (
        <DateTimePicker
          value={date}
          mode="time"
          display="compact"
          locale="it-IT"
          onChange={(_e, picked) => picked && onChange(toTime(picked))}
        />
      ) : (
        <Pressable
          onPress={() => (Platform.OS === 'ios' ? onChange(fallback) : open())}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={[styles.value, !value && styles.placeholder]}>
            {value ? value.slice(0, 5) : 'Scegli'}
          </Text>
        </Pressable>
      )}
      {value && (
        <Pressable
          onPress={() => onChange(null)}
          hitSlop={8}
          accessibilityLabel={`Togli ${label.toLowerCase()}`}
        >
          <Ionicons name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}
