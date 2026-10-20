import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clientName, useClients } from '@/lib/affitti';
import { useMembership } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/clienti';

export default function Clienti() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const [search, setSearch] = useState('');
  const clients = useClients(orgId, search);
  const list = clients.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Calendario</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/calendario/cliente/[id]', params: { id: 'nuovo' } })}
          style={({ pressed }) => [styles.newButton, pressed && styles.newPressed]}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.onAccent} />
          <Text style={styles.newText}>Nuovo</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={type.title}>Rubrica clienti</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca per nome, cognome o telefono"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          clients.isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[type.caption, styles.empty]}>
              {search
                ? 'Nessun cliente trovato.'
                : 'La rubrica è vuota: i clienti si aggiungono anche creando un affitto.'}
            </Text>
          )
        }
        renderItem={({ item: c, index }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/calendario/cliente/[id]', params: { id: c.id } })}
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.first,
              index === list.length - 1 && styles.last,
              index < list.length - 1 && styles.divider,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.avatar}>
              <Text style={styles.initials}>
                {(c.first_name[0] ?? '').toUpperCase()}
                {(c.last_name?.[0] ?? '').toUpperCase()}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={type.body}>{clientName(c)}</Text>
              <Text style={type.caption} numberOfLines={1}>
                {[c.phone, c.address].filter(Boolean).join(' · ') || 'Nessun contatto'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
