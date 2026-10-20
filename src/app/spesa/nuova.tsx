import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type Location } from '@/lib/items';
import { errorMessage, locationsLabel, useCreateList, useLowStock } from '@/lib/spesa';
import { LocationPicker } from '@/components/LocationPicker';
import { useMembership } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/spesa/nuova';

const defaultName = (locations: Location[]) =>
  `Spesa ${locationsLabel(locations)} ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`;

export default function NuovaLista() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const [locations, setLocations] = useState<Location[]>(['cucina']);
  const [name, setName] = useState('');
  const [addLow, setAddLow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const low = useLowStock(orgId, locations);
  const create = useCreateList(orgId);
  const lowCount = low.data?.length ?? 0;

  function save() {
    setError(null);
    create.mutate(
      { name: name.trim() || defaultName(locations), locations, addLow: addLow && lowCount > 0 },
      {
        onSuccess: (id) => router.replace({ pathname: '/spesa/[id]', params: { id: id! } }),
        onError: (e) => setError(errorMessage(e, 'Creazione non riuscita. Riprova.')),
      },
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Nuova lista</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={type.label}>Per</Text>
          <LocationPicker value={locations} onChange={setLocations} />
          <Text style={type.caption}>
            Puoi sceglierne più di uno. Se poi aggiungi un prodotto di un altro luogo, si aggiunge da solo.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={type.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={defaultName(locations)}
            placeholderTextColor={colors.muted}
            autoCapitalize="sentences"
            style={styles.input}
          />
          <Text style={type.caption}>Se lo lasci vuoto usiamo quello suggerito.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.flex}>
            <Text style={type.body}>Aggiungi i prodotti sotto scorta</Text>
            <Text style={type.caption}>
              {low.isLoading
                ? 'Controllo l’inventario…'
                : lowCount === 0
                  ? `Niente sotto scorta in ${locationsLabel(locations)}`
                  : `${lowCount} in ${locationsLabel(locations)}: ${low
                      .data!.slice(0, 3)
                      .map((i) => i.name)
                      .join(', ')}${lowCount > 3 ? '…' : ''}`}
            </Text>
          </View>
          <Switch
            value={addLow && lowCount > 0}
            onValueChange={setAddLow}
            disabled={lowCount === 0}
            trackColor={{ true: colors.accent, false: colors.segment }}
            thumbColor={colors.onAccent}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={save}
          disabled={create.isPending}
          style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.85 }]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.saveText}>Crea la lista</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
