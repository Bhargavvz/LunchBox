import { zodResolver } from '@hookform/resolvers/zod';
import { Banner, Button, Screen, Text, TextField } from '@lunchbox/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { z } from 'zod';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const schema = z.object({
  label: z.string().trim().min(1).max(40),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
  instructions: z.string().trim().max(500).optional(),
});
type Form = z.infer<typeof schema>;

const DEFAULT_REGION: Region = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.01, longitudeDelta: 0.01 };

/** The pin is fixed at the map centre; the parent drags the map until the pin sits on their door. */
export default function NewAddressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { label: 'Home', line1: '', line2: '', landmark: '', city: '', pincode: '', instructions: '' },
  });

  async function useMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setRegion({ ...region, latitude: pos.coords.latitude, longitude: pos.coords.longitude });
  }

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.addresses.create({
        label: v.label,
        line1: v.line1,
        line2: v.line2 || undefined,
        landmark: v.landmark || undefined,
        city: v.city,
        pincode: v.pincode,
        instructions: v.instructions || undefined,
        location: { lat: region.latitude, lng: region.longitude },
        makeDefault: false,
      });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const field = (name: keyof Form, label: string, props: object = {}) => (
    <Controller control={control} name={name} render={({ field: f, fieldState }) => (
      <TextField label={label} value={f.value ?? ''} onChangeText={f.onChange} error={fieldState.error ? label : undefined} {...props} />
    )} />
  );

  return (
    <Screen>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Text muted>{t('address.pin')}</Text>
      <View style={styles.map}>
        <MapView provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill} region={region} onRegionChangeComplete={setRegion}
                 accessibilityLabel={t('address.pin')} />
        <View pointerEvents="none" style={styles.pin}>
          <Text variant="title">📍</Text>
        </View>
      </View>
      <Button title={t('address.useLocation')} variant="ghost" onPress={useMyLocation} />
      {field('label', t('address.label'))}
      {field('line1', t('address.line1'), { testID: 'address-line1' })}
      {field('line2', t('address.line2'))}
      {field('landmark', t('address.landmark'))}
      {field('city', t('address.city'), { testID: 'address-city' })}
      {field('pincode', t('address.pincode'), { keyboardType: 'number-pad', maxLength: 6, testID: 'address-pincode' })}
      {field('instructions', t('address.instructions'), { multiline: true })}
      <Button title={t('common.save')} onPress={submit} loading={formState.isSubmitting} testID="address-save" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 260, borderRadius: 16, overflow: 'hidden' },
  pin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -14, marginTop: -34 },
});
