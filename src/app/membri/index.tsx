import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ROLE_LABEL, useMembers, useRole, type Member, type Role } from '@/lib/ruoli';
import { personShort, usePeople } from '@/lib/turni';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/membri';

const GROUPS: { role: Role; title: string }[] = [
  { role: 'admin', title: 'Amministratori' },
  { role: 'consigliere', title: 'Consiglieri' },
  { role: 'volontario', title: 'Volontari' },
];

export default function Membri() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { orgId, userId, isAdmin } = useRole();
  const members = useMembers(orgId, isAdmin);
  const people = usePeople(orgId);
  const personById = new Map((people.data ?? []).map((p) => [p.id, p]));

  function open(m: Member) {
    if (m.created_by !== userId) {
      Alert.alert(
        m.user_id === userId ? 'È il tuo account' : 'Account di un altro amministratore',
        m.user_id === userId
          ? 'Il tuo account lo gestisce chi l’ha creato.'
          : 'Puoi modificare o eliminare solo gli account che hai creato tu.',
      );
      return;
    }
    router.push({ pathname: '/membri/[id]', params: { id: m.user_id } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Impostazioni</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/membri/[id]', params: { id: 'nuovo' } })}
          style={({ pressed }) => [styles.newButton, pressed && styles.newPressed]}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.onAccent} />
          <Text style={styles.newText}>Nuovo</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.title}>Account</Text>
        <Text style={type.caption}>
          I consiglieri possono fare tutto; i volontari vedono l’inventario senza modificarlo, creano liste e
          menù e non vedono il calendario. Puoi modificare solo gli account che hai creato tu.
        </Text>

        {members.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          GROUPS.map((g) => {
            const list = (members.data ?? []).filter((m) => m.role === g.role);
            if (!list.length) return null;
            return (
              <View key={g.role} style={styles.group}>
                <Text style={styles.groupTitle}>
                  {g.title} · {list.length}
                </Text>
                <View style={styles.card}>
                  {list.map((m, i) => {
                    const mine = m.created_by === userId;
                    const linked = m.shift_person_id ? personById.get(m.shift_person_id) : null;
                    return (
                      <Pressable
                        key={m.user_id}
                        onPress={() => open(m)}
                        style={({ pressed }) => [
                          styles.row,
                          i < list.length - 1 && styles.divider,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.avatar}>
                          <Text style={styles.initial}>{(m.display_name?.[0] ?? '?').toUpperCase()}</Text>
                        </View>
                        <View style={styles.flex}>
                          <Text style={type.body} numberOfLines={1}>
                            {m.display_name ?? m.email ?? '—'}
                            {m.user_id === userId ? ' (tu)' : ''}
                          </Text>
                          <Text style={type.caption} numberOfLines={1}>
                            {[m.email, linked ? `turni: ${personShort(linked)}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <Ionicons
                          name={mine ? 'chevron-forward' : 'lock-closed-outline'}
                          size={18}
                          color={colors.muted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
        <Text style={[type.caption, styles.legend]}>
          Il lucchetto indica gli account creati da un altro amministratore. Ruoli: {ROLE_LABEL.admin},{' '}
          {ROLE_LABEL.consigliere}, {ROLE_LABEL.volontario}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
